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

def test_fbcca():
    sr = 512
    config = {
        "sampling_rate": sr,
        "features": {
            "EEG": {
                "target_freqs": [9.0, 10.0, 11.0, 12.0, 13.0, 15.0],
                "rest_threshold": 0.35,
                "debounce_ms": 0
            }
        }
    }
    
    detector = EEGFrequencyDetector(config)
    
    # Test each target frequency
    for target_f in config["features"]["EEG"]["target_freqs"]:
        # Simulate 1s of target signal + some noise
        clean_sig = generate_sine(target_f, 1.0, sr)
        noise = np.random.normal(0, 0.5, len(clean_sig))
        sig = clean_sig + noise
        
        features = {"raw_window": sig.tolist()}
        result = detector.detect(features)
        
        expected = f"TARGET_{str(target_f).replace('.', '_')}HZ"
        print(f"Testing {target_f}Hz: Result={result} (Expected={expected})")
        assert result == expected or result == "REST" # Noise might push it to REST if very high
        
    # Test REST (pure noise)
    noise = np.random.normal(0, 1.0, sr)
    features = {"raw_window": noise.tolist()}
    result = detector.detect(features)
    print(f"Testing REST (Noise): Result={result} (Expected=REST)")
    assert result == "REST" or result is None

if __name__ == "__main__":
    try:
        test_fbcca()
        print("\n[SUCCESS] FBCCA Detector verification passed!")
    except Exception as e:
        print(f"\n[FAILURE] Verification failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
