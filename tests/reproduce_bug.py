import numpy as np
from scipy import stats
import sys
from pathlib import Path

# Add src to path
sys.path.append(str(Path(__file__).parent.parent / "src"))

from feature.extractors.rps_extractor import RPSExtractor

def reproduce_issue():
    print("=== Reproducing RPSExtractor Issue ===")
    
    # Simulate a window of all zeros
    window = [0.0] * 512
    
    features = RPSExtractor.extract_features(window)
    print("Features for all zeros:")
    for k, v in features.items():
        print(f"  {k}: {v} (type: {type(v)})")
        if np.isinf(v) or np.isnan(v):
            print(f"  [ERROR] {k} is {v}!")

    # Check for NaN/Inf in any value
    has_issue = any(np.isinf(v) or np.isnan(v) for v in features.values())
    if has_issue:
        print("\n[CONFIRMED] Detected invalid values in features!")
    else:
        print("\n[NOT REPRODUCED] No invalid values detected.")

if __name__ == "__main__":
    reproduce_issue()
