import sys
from pathlib import Path

PROJECT_ROOT = Path("e:/WebSite/NeuroTECH-BCI")
sys.path.append(str(PROJECT_ROOT / "backend"))

from src.server.server import create_app
app = create_app()

with app.app_context():
    from src.server.server.routes.training_routes import api_list_models, api_list_eog_models
    
    print("Testing EMG models list...")
    try:
        response = api_list_models()
        print("Response:", response.get_data(as_text=True))
    except Exception as e:
        import traceback
        print("Crash in EMG list models!")
        traceback.print_exc()

    print("Testing EOG models list...")
    try:
        response = api_list_eog_models()
        print("Response:", response.get_data(as_text=True))
    except Exception as e:
        import traceback
        print("Crash in EOG list models!")
        traceback.print_exc()
