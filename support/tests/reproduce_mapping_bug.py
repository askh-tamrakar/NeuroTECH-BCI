import json
import sys
from pathlib import Path
import numpy as np

# Add project root to path
sys.path.append(str(Path(__file__).parent.parent))

from src.processing.filter_router import FilterRouter
from src.processing.emg_processor import EMGFilterProcessor

def test_multi_channel_routing():
    print("=== Filter Router Multi-Channel Verification ===")
    
    # Mock Config similar to user's setup
    config = {
        "sampling_rate": 512,
        "channel_mapping": {
            "ch0": {"sensor": "EEG", "enabled": True},
            "ch1": {"sensor": "EMG", "enabled": True}
        },
        "filters": {
            "EEG": {"cutoff": 1.0, "order": 4},
            "EMG": {
                "bandpass_enabled": True,
                "bandpass_low": 20,
                "bandpass_high": 250,
                "cutoff": 70,
                "order": 4,
                "envelope_enabled": True
            }
        }
    }
    
    # Save temp config files to project root/config if possible, or mock load_config
    # Actually, we can just inject it into FilterRouter if we mock it
    
    router = FilterRouter()
    router.config = config
    router.sr = 512
    router.num_channels = 2
    router.raw_index_map = [(0, "ch0", "ch0"), (1, "ch1", "ch1")]
    
    print("\nRunning _configure_pipeline...")
    router._configure_pipeline()
    
    print(f"\nProcs: {router.channel_processors}")
    
    # Verify ch1 has EMG processor
    if 1 in router.channel_processors and isinstance(router.channel_processors[1], EMGFilterProcessor):
        print("[PASS] ch1 has EMGFilterProcessor")
        proc = router.channel_processors[1]
        print(f"  Enveloping Enabled: {proc.envelope_enabled}")
        
        # Test processing
        raw_val = 1.0
        out = proc.process_sample(raw_val)
        print(f"  Processing: {raw_val} -> {out:.4f}")
        
        # If enveloping is working, a constant 1.0 should produce a non-zero positive value after settling 
        # (Actually, HP filter will make it go to zero, but BP+Rectify will produce something)
    else:
        print("[FAIL] ch1 does NOT have the correct processor!")

if __name__ == "__main__":
    test_multi_channel_routing()
