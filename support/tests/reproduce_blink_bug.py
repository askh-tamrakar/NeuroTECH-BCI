import sys
import os
from pathlib import Path

# Add src to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.append(str(PROJECT_ROOT / "src"))

from feature.detectors.blink_detector import BlinkDetector

def test_scenario(name, peak_count):
    print(f"\n--- Testing Scenario: {name} (Peaks: {peak_count}) ---")
    config = {
        "features": {
            "EOG": {
                "amp_threshold": 300.0,
                "min_duration_ms": 50.0,
                "max_duration_ms": 800.0
            }
        }
    }
    
    detector = BlinkDetector(config)
    
    # Mock features representing a blink
    features = {
        "amplitude": 400.0,
        "duration_ms": 200.0,
        "timestamp": 1.0,
        "peak_count": peak_count
    }
    
    detection_result = detector.detect(features)
    
    print(f"Detection result: {detection_result} (type: {type(detection_result)})")
    
    # Simulate Router logic
    event_name = detection_result
    
    if not event_name:
        print("FAILED: No event detected")
        return
        
    if not isinstance(event_name, str):
        print(f"FAILED: event_name is not a string! Type: {type(event_name)}")
        return
        
    print(f"SUCCESS: Event '{event_name}' created successfully")

if __name__ == "__main__":
    test_scenario("Single Blink", 1)
    test_scenario("Double Blink", 2)
