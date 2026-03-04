import numpy as np
from scipy import stats
import sys
from pathlib import Path

# Add src to path
sys.path.append(str(Path(__file__).parent.parent / "src"))

from feature.extractors.rps_extractor import RPSExtractor
from feature.detectors.rps_detector import RPSDetector

def test_robustness():
    print("=== RPSExtractor Robustness Test ===")
    
    test_cases = {
        "all_zeros": [0.0] * 512,
        "nans": [np.nan] * 512,
        "infs": [np.inf] * 512,
        "massive_values": [1e100] * 512,
        "mixed_invalid": [0.0, np.nan, np.inf, -np.inf, 1e100] * 100 + [0.0]*12
    }
    
    detector = RPSDetector({"features": {"RPS": {"confidence_threshold": 0.6}}})

    for name, window in test_cases.items():
        print(f"\nTesting Case: {name}")
        features = RPSExtractor.extract_features(window)
        
        # Verify features are finite
        all_finite = True
        for k, v in features.items():
            if not np.isfinite(v):
                print(f"  [FAIL] {k} is {v}!")
                all_finite = False
        
        if all_finite:
            print(f"  [PASS] All features are finite.")
        else:
            print(f"  [FAIL] Some features are non-finite.")

        # Verify Detector handles them
        try:
            label, confidence = detector.predict_instant(features)
            print(f"  Detector: label={label}, conf={confidence:.2f}")
            print(f"  [PASS] Detector handled features without crashing.")
        except Exception as e:
            print(f"  [FAIL] Detector crashed: {e}")

    print("\n=== Verification Complete ===")

if __name__ == "__main__":
    test_robustness()
