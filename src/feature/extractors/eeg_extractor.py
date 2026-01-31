import numpy as np
from scipy.signal import welch

class EEGExtractor:
    """
    Extracts EEG features, primarily Band Powers.
    """
    
    BANDS = {
        'Delta': (0.5, 4),
        'Theta': (4, 8),
        'Alpha': (8, 13),
        'Beta': (13, 30),
        'Gamma': (30, 100)
    }

    @staticmethod
    def extract_features(samples, sr=512):
        """
        Extracts features from raw EEG samples (time-domain list/array).
        Returns a dict of features.
        """
        data = np.array(samples)
        if len(data) < 2:
            return {f"bp_{b.lower()}": 0.0 for b in EEGExtractor.BANDS}

        # Handle potentially multi-channel or single channel. 
        # Assuming single channel input (1D array) for now, as windows are usually per-channel or aggregated before.
        # If multi-channel, we might averages or specific channel selection.
        # Based on other extractors, it seems we process raw list of values (likely one stream/channel or composite).
        
        features = {}
        
        # 1. Band Powers using Welch's method
        try:
            freqs, psd = welch(data, fs=sr, nperseg=min(len(data), 256))
            
            total_power = 0
            
            for band, (f_min, f_max) in EEGExtractor.BANDS.items():
                idx = np.logical_and(freqs >= f_min, freqs <= f_max)
                band_power = np.trapz(psd[idx], freqs[idx])
                features[f"bp_{band.lower()}"] = band_power
                total_power += band_power

            # Relative Band Powers (useful for normalizing against total power)
            if total_power > 0:
                for band in EEGExtractor.BANDS:
                     features[f"rel_{band.lower()}"] = features[f"bp_{band.lower()}"] / total_power
            else:
                 for band in EEGExtractor.BANDS:
                     features[f"rel_{band.lower()}"] = 0.0

        except Exception as e:
            print(f"EEG Feature Extraction Error: {e}")
            for band in EEGExtractor.BANDS:
                features[f"bp_{band.lower()}"] = 0.0
                features[f"rel_{band.lower()}"] = 0.0

        # 2. Time Domain Stats (Simple additions)
        features['mean'] = np.mean(data)
        features['std'] = np.std(data)
        features['max'] = np.max(data)
        features['min'] = np.min(data)
        
        return features
