import sys
from pathlib import Path

# Add src to path
project_root = Path(__file__).resolve().parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

try:
    from src.learning.model_trainer import list_saved_models
    print("Testing list_saved_models('EMG')...")
    models = list_saved_models('EMG')
    print(f"Success! Found {len(models)} models.")
    
    # Try EOG
    print("Testing list_saved_models('EOG')...")
    eog_models = list_saved_models('EOG')
    print(f"Success! Found {len(eog_models)} EOG models.")

except Exception as e:
    import traceback
    print(f"Failed: {e}")
    traceback.print_exc()

import flask
app = flask.Flask(__name__)

from src.server.server.routes.training_routes import training_bp
app.register_blueprint(training_bp)

with app.test_client() as client:
    print("Testing /api/models/emg...")
    resp = client.get('/api/models/emg')
    print(f"Status: {resp.status_code}")
    if resp.status_code != 200:
        print(f"Error Body: {resp.get_data(as_text=True)}")
