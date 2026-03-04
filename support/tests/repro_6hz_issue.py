import numpy as np
import sys
import os
from pathlib import Path

# Add src to path
sys.path.append(str(Path(__file__).parent.parent / "src"))

from feature.detectors.eeg_frequency_detector import EEGFrequencyDetector

def generate_sine(f, duration, sr):
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    return np.sin(2 * np.pi * f * t)

def test_6hz_detection():
    print("=== Testing 6Hz Detection (Reproduction) ===")
    
    sr = 512
    target_freqs = [6.0, 8.0, 10.0, 12.0, 15.0, 20.0]
    config = {
        "sampling_rate": sr,
        "features": {
            "EEG": {
                "window_len_sec": 1.0,
                "target_freqs": target_freqs,
                "num_harmonics": 3,
                "rest_threshold": 0.35,
                "debounce_ms": 0
            }
        }
    }
    
    detector = EEGFrequencyDetector(config)
    
    target_f = 6.0
    # Simulate 1s of 6Hz signal + some noise
    clean_sig = generate_sine(target_f, 1.0, sr)
    noise = np.random.normal(0, 0.2, len(clean_sig))
    sig = clean_sig + noise
    
    features = {"raw_window": sig.tolist()}
    result = detector.detect(features)
    
    expected = "TARGET_6_0HZ"
    print(f"Testing 6.0Hz: Result={result} (Expected={expected})")
    
    if result == expected:
        print("[SUCCESS] 6.0Hz detected!")
    else:
        print(f"[FAILURE] 6.0Hz NOT detected. Result was: {result}")
        sys.exit(1)

if __name__ == "__main__":
    test_6hz_detection()
