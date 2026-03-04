import sys
from pathlib import Path
import json

# Add project root
project_root = Path(__file__).resolve().parent.parent
sys.path.append(str(project_root))

from src.learning.model_trainer import list_saved_models, MODELS_ROOT

print(f"MODELS_ROOT: {MODELS_ROOT}")
print(f"Checking for EMG directory: {(MODELS_ROOT / 'EMG').exists()}")

try:
    models = list_saved_models("EMG")
    print(f"Found {len(models)} models:")
    for m in models:
        print(f" - {m['name']} (Path: {m['path']})")
except Exception as e:
    print(f"ERROR calling list_saved_models: {e}")
