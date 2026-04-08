"""
Spectral Features Module
Computes signal power in various frequency bands using Welch's method.
"""
import numpy as np
from scipy.signal import welch

def compute_band_powers(data, sr=1000):
    """
    Computes absolute band powers using Welch's PSD.
    data: 1D array of EEG samples for a single window.
    sr: Sampling rate.
    """
    if data is None or len(data) == 0:
        return {}

    # Welch's method (nperseg=len(data) uses the whole window as one segment)
    freqs, psd = welch(data, fs=sr, nperseg=len(data))
    
    bands = {
        'delta': (0.5, 4.0),
        'theta': (4.0, 8.0),
        'alpha': (8.0, 12.0),
        'beta': (12.0, 30.0),
        'gamma': (30.0, 45.0)
    }
    
    powers = {}
    for band_name, (low, high) in bands.items():
        idx_band = np.logical_and(freqs >= low, freqs <= high)
        # Power is proportional to the sum of the PSD in the band
        powers[band_name] = np.sum(psd[idx_band])
        
    return powers
