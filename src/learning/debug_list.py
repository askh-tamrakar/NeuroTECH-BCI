import sys
import os
from pathlib import Path

# Mimic model_trainer.py path logic
MODELS_ROOT = Path(__file__).resolve().parent.parent.parent / "data" / "models"

print(f"Calculated MODELS_ROOT: {MODELS_ROOT}")
print(f"Exists? {MODELS_ROOT.exists()}")

if MODELS_ROOT.exists():
    print("Contents of MODELS_ROOT:")
    for x in MODELS_ROOT.iterdir():
        print(f" - {x.name} ({'DIR' if x.is_dir() else 'FILE'})")
        
    emg_path = MODELS_ROOT / "EMG"
    print(f"\nChecking EMG path: {emg_path}")
    print(f"Exists? {emg_path.exists()}")
    
    if emg_path.exists():
        print("Contents of EMG:")
        files = list(emg_path.glob("*.joblib"))
        print(f"Found {len(files)} .joblib files via glob")
        for f in files:
            print(f" - {f.name}")
else:
    print("MODELS_ROOT does not exist!")
