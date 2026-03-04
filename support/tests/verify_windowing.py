import sys
from pathlib import Path
import numpy as np

# Add src to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.append(str(PROJECT_ROOT / "src"))

from feature.extractors.blink_extractor import BlinkExtractor

def test_robust_windowing():
    sr = 512
    config = {"features": {"EOG": {"amp_threshold": 300.0, "min_duration_ms": 50.0, "max_duration_ms": 1500.0}}}
    extractor = BlinkExtractor(0, config, sr)
    
    print("\n--- Scenario 1: Biphasic Single Blink (Positive then Negative) ---")
    # Generate biphasic pulse: 200ms positive, 100ms gap, 200ms negative
    pos_hump = np.sin(np.linspace(0, np.pi, int(sr * 0.2))) * 1000
    gap = np.zeros(int(sr * 0.1))
    neg_hump = -np.sin(np.linspace(0, np.pi, int(sr * 0.2))) * 800
    silence = np.zeros(int(sr * 1.0)) # 1s silence to trigger window close
    
    full_signal = np.concatenate([pos_hump, gap, neg_hump, silence])
    
    events = []
    for sample in full_signal:
        result = extractor.process(float(sample))
        if result:
            events.append(result)
            
    print(f"Events detected: {len(events)}")
    if len(events) == 1:
        print(f"SUCCESS: Biphasic blink captured in ONE window. Peaks: {events[0]['peak_count']}, Duration: {events[0]['duration_ms']:.1f}ms")
    else:
        print(f"FAILED: Biphasic blink split into {len(events)} windows.")

    print("\n--- Scenario 2: Double Hump Blink ---")
    extractor = BlinkExtractor(0, config, sr) # Reset
    # Generate double hump: 200ms hump, 200ms valley (low but >0), 200ms hump
    hump1 = np.sin(np.linspace(0, np.pi, int(sr * 0.2))) * 1000
    valley = np.ones(int(sr * 0.2)) * 50 # Below threshold/4
    hump2 = np.sin(np.linspace(0, np.pi, int(sr * 0.2))) * 900
    
    full_signal = np.concatenate([hump1, valley, hump2, silence])
    
    events = []
    for sample in full_signal:
        result = extractor.process(float(sample))
        if result:
            events.append(result)
            
    print(f"Events detected: {len(events)}")
    if len(events) == 1:
        print(f"SUCCESS: Double hump captured in ONE window. Peaks: {events[0]['peak_count']}, Duration: {events[0]['duration_ms']:.1f}ms")
    else:
        print(f"FAILED: Double hump split into {len(events)} windows.")

if __name__ == "__main__":
    test_robust_windowing()
