"""
Filter Bank Canonical Correlation Analysis (FBCCA)
For SSVEP target detection.
"""
import numpy as np
from sklearn.cross_decomposition import CCA
from scipy.signal import butter, filtfilt

def generate_reference_signals(freq, sr, num_samples, num_harmonics=3):
    """Generates sine/cosine reference signals for SSVEP."""
    t = np.arange(num_samples) / sr
    Y = []
    for h in range(1, num_harmonics + 1):
        Y.append(np.sin(2 * np.pi * h * freq * t))
        Y.append(np.cos(2 * np.pi * h * freq * t))
    return np.array(Y).T

def fbcca(eeg_data, freqs, sr=1000, num_harmonics=3, num_bands=3):
    """
    Filter Bank Canonical Correlation Analysis for SSVEP target selection.
    
    Args:
        eeg_data: (num_samples, num_channels) 2D array
        freqs: list of stimulus frequencies
        sr: sampling rate (default 1000)
    Returns:
        target_index: Index of the selected frequency
        scores: The CCA scores for all frequencies
    """
    if len(eeg_data.shape) == 1:
        eeg_data = eeg_data.reshape(-1, 1)
        
    num_samples = eeg_data.shape[0]
    num_targets = len(freqs)
    
    Y = [generate_reference_signals(f, sr, num_samples, num_harmonics) for f in freqs]
    
    # Filter bank design weights
    weights = np.array([1.0, 0.6, 0.4])[:num_bands]
    
    rho = np.zeros((num_bands, num_targets))
    cca = CCA(n_components=1)
    
    nyq = sr / 2.0
    
    for band_idx in range(min(num_bands, len(weights))):
        lowcut = 8.0 * (band_idx + 1)
        highcut = 88.0
        
        if lowcut >= highcut or lowcut >= nyq:
            continue
            
        b, a = butter(4, [lowcut/nyq, min(highcut, nyq-1)/nyq], btype='bandpf', analog=False) if lowcut/nyq < 1.0 else (None, None)
        
        if b is None:
            filtered_data = eeg_data
        else:
            try:
                filtered_data = filtfilt(b, a, eeg_data, axis=0)
            except ValueError:
                filtered_data = eeg_data # Fallback if sequence too short
        
        for t_idx in range(num_targets):
            try:
                cca.fit(filtered_data, Y[t_idx])
                u, v = cca.transform(filtered_data, Y[t_idx])
                
                if u.shape[0] > 1:
                    corr = np.corrcoef(u.T, v.T)[0, 1]
                    if not np.isnan(corr):
                        rho[band_idx, t_idx] = corr
            except Exception:
                pass
                
    # Weighted sum of squared correlations
    weighted_rho = np.sum(weights[:, np.newaxis] * (rho ** 2), axis=0)
    
    if np.sum(weighted_rho) == 0:
        return -1, weighted_rho # No valid correlation
        
    return int(np.argmax(weighted_rho)), weighted_rho
