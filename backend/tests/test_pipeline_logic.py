import sys
from pathlib import Path
import numpy as np

# Add backend to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR))

# Mock config manager if needed or rely on default fallback
try:
    from core.processing.pipeline import ProcessingPipeline
    print("[TEST] Imported ProcessingPipeline successfully.")
except ImportError as e:
    print(f"[TEST] Failed to import Pipeline: {e}")
    sys.exit(1)

def test_pipeline():
    print("\n--- Pipeline Logic Test ---")
    pipeline = ProcessingPipeline()
    print(f"[TEST] Pipeline Initialized. Config: {pipeline.config.keys() if pipeline.config else 'Defaults'}")

    # Create synthetic data (Sine wave + Noise) - Simulate 4 channels
    # 250Hz sampling rate
    t = np.linspace(0, 1.0, 250)
    signal = np.sin(2 * np.pi * 10 * t) # 10Hz signal
    
    print(f"[TEST] Processing {len(t)} samples...")
    
    processed_data = []
    
    for i, val in enumerate(signal):
        # Create packet
        sample = {
            "ch0": val + np.random.normal(0, 0.1), # Noisy
            "ch1": val,
            "timestamp": i
        }
        
        # Process
        result = pipeline.process_sample(sample)
        processed_data.append(result['ch0'])
        
        # Verify structure
        if i == 0:
            print(f"[TEST] Sample 0 Input: {sample}")
            print(f"[TEST] Sample 0 Output: {result}")
            if 'ch0' not in result:
                print("[TEST] ❌ 'ch0' missing in output!")
                return
            if result['ch0'] == sample['ch0']:
                print("[TEST] ⚠️ Output equals Input (Filter might be disabled or pass-through)")
            else:
                 print("[TEST] ✅ Output is modified (Filter Active)")

    print(f"[TEST] Processed {len(processed_data)} samples.")
    print("[TEST] Pipeline Test Complete.")

if __name__ == "__main__":
    test_pipeline()
