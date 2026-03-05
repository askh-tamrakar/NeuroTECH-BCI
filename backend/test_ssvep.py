import numpy as np
import sys
from pathlib import Path

# Add backend to path
sys.path.append(str(Path("i:/Neuroscience/Brain-To-Brain-Telepathic-Communication-System/backend").resolve()))

from src.feature.detectors.eeg_frequency_detector import EEGFrequencyDetector

def main():
    print("Testing EEGFrequencyDetector...")
    config = {
        "sampling_rate": 512,
        "features": {
            "EEG": {
                "target_freqs": [6.0, 8.0, 10.0, 12.0, 15.0, 18.0, 20.0],
                "window_len_sec": 1.0,
                "num_harmonics": 3,
                "rest_threshold": 0.35,
                "debounce_ms": 0
            }
        }
    }
    
    detector = EEGFrequencyDetector(config)
    
    # Generate 1 second of 512Hz data containing an 8.0Hz sine wave
    t = np.linspace(0, 1.0, 512, endpoint=False)
    # Give it a strong 8Hz signal
    signal = 100 * np.sin(2 * np.pi * 8.0 * t) + 10 * np.random.randn(512)
    
    features = {
        "raw_window": signal.tolist()
    }
    
    result = detector.detect(features)
    print(f"Detection Result: {result}")

if __name__ == "__main__":
    main()
