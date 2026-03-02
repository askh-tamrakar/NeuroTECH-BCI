import numpy as np
import sys
from pathlib import Path

# Add project root to path
sys.path.append(str(Path(__file__).parent.parent))

from src.processing.emg_processor import EMGFilterProcessor

def test_emg_processor_math():
    print("=== EMGFilterProcessor Math Verification ===")
    
    config = {
        "filters": {
            "EMG": {
                "cutoff": 70.0,
                "order": 4,
                "notch_enabled": True,
                "notch_freq": 50.0,
                "bandpass_enabled": True,
                "bandpass_low": 20.0,
                "bandpass_high": 250.0,
                "envelope_enabled": False
            }
        }
    }
    
    sr = 512
    processor = EMGFilterProcessor(config, sr)
    
    # 1. Verify filters are designed
    print(f"HP coefficients: b={len(processor.b_hp)}, a={len(processor.a_hp)}")
    print(f"BP coefficients: b={len(processor.b_bp)}, a={len(processor.a_bp)}")
    
    # 2. Test processing a single sample doesn't crash
    val = 1.0
    out = processor.process_sample(val)
    print(f"Input: {val} -> Output: {out:.4f}")
    
    # 3. Test config update logic
    print("\nTesting Update Config (No change)...")
    import io
    from contextlib import redirect_stdout
    
    f = io.StringIO()
    with redirect_stdout(f):
        processor.update_config(config, sr)
    output = f.getvalue()
    
    if "Config changed" in output:
        print("[FAIL] Processor reported config change when none occurred!")
    else:
        print("[PASS] Processor correctly identified no change.")
        
    print("\nTesting Update Config (Small change in BP)...")
    config["filters"]["EMG"]["bandpass_high"] = 200.0
    f = io.StringIO()
    with redirect_stdout(f):
        processor.update_config(config, sr)
    output = f.getvalue()
    
    if "Config changed" in output:
        print("[PASS] Processor correctly identified change.")
    else:
        print("[FAIL] Processor missed the config change!")

if __name__ == "__main__":
    test_emg_processor_math()
