import sys
from pathlib import Path

PROJECT_ROOT = Path("e:/WebSite/NeuroTECH-BCI/backend")
sys.path.append(str(PROJECT_ROOT))

# Test imports
from src.server.server.state import state
from src.utils.config import config_manager
from src.feature.detectors.rps_detector import RPSDetector
from src.learning.model_trainer import load_model

print("Testing list models...")
from src.utils.paths import get_models_dir
MODELS_DIR = get_models_dir('EMG')
active_name = config_manager.get_active_model('EMG')
print(f"Active model: {active_name}")

if MODELS_DIR.exists():
    all_files = list(MODELS_DIR.glob("*.joblib"))
    print(f"Found {len(all_files)} joblib files")
else:
    print("MODELS_DIR does not exist!")

print("Testing load_model...")
result = load_model('EMG', 'emg_rf')
print("Load result:", result)

try:
    state.rps_detector = RPSDetector(config_manager.get_all_configs())
    print("RPS Detector loaded!")
except Exception as e:
    print("RPS Detector failed:", e)

# Test the exact api_load_model logic flow:
print("Testing RPSDetector.load_model('emg_rf') ...")
try:
    state.rps_detector.load_model('emg_rf', verbose=True)
    print("RPSDetector load_model success!")
except Exception as e:
    print("RPSDetector load_model failed:", e)
    
print("Testing if models list fails...")
try:
    from src.server.server.routes.training_routes import api_list_models
    print("Imported api_list_models")
except Exception as e:
    print("Failed to import api_list_models:", e)
