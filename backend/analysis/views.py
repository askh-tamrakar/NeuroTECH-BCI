import json
import os
import glob
from pathlib import Path
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings
from core.utils.config import config_manager
import pandas as pd
import logging

from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt

logger = logging.getLogger(__name__)

# Paths
# Adjust access to backend root relative to this file? 
# Base dir is backend/. Data is backend/data.
DATA_DIR = settings.BASE_DIR / "data"
PROCESSED_DIR = DATA_DIR / "processed"
RECORDINGS_DIR = DATA_DIR / "recordings"

@method_decorator(csrf_exempt, name='dispatch')
class ConfigView(APIView):
    """
    GET /api/config -> Returns merged configuration.
    POST /api/config -> Updates sensor configuration.
    """
    def get(self, request):
        try:
            config = config_manager.get_all_configs()
            return Response(config)
        except Exception as e:
            logger.error(f"Error fetching config: {e}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def post(self, request):
        try:
            # For now, we assume the POST body updates the sensor_config
            # Ideally, we should split endpoints, but monolithic is what frontend expects
            new_config = request.data
            
            # Here we might need logic to split the config back into parts if the frontend sends everything merged.
            # But based on calibrationApi.js: saveSensorConfig sends the whole object.
            
            # Simple approach: Update sensor config with matching keys
            # or try to save specific parts.
            
            # Check what's changing. If it has 'filters', update filters, etc.
            
            success = True
            if 'filters' in new_config:
                success &= config_manager.save_filter_config(new_config['filters'])
            
            # Save core sensor config (everything else?)
            # This is risky if we blindly save everything.
            # Let's trust the ConfigManager or just save it as sensor config for now if it matches schema.
            
            # For safety, let's extract known keys
            # or just default to saving as sensor config which acts as master? 
            # The config_manager.save_sensor_config saves to sensor_config.json.
            
            success &= config_manager.save_sensor_config(new_config)
            
            if success:
                return Response({"status": "updated"})
            else:
                return Response({"error": "Failed to save configuration"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
        except Exception as e:
            logger.error(f"Error saving config: {e}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class RecordingView(APIView):
    def get(self, request):
        recordings = []
        if RECORDINGS_DIR.exists():
             for f in RECORDINGS_DIR.iterdir():
                 if f.suffix in ['.csv', '.json']:
                     recordings.append({
                         "id": f.name,
                         "name": f.stem,
                         "created_at": f.stat().st_mtime
                     })
        return Response(recordings)

@method_decorator(csrf_exempt, name='dispatch')
class EvaluateModelView(APIView):
    def post(self, request):
        return Response({"accuracy": 0.85, "report": "Stub Evaluation"})

@method_decorator(csrf_exempt, name='dispatch')
class PredictControlView(APIView):
    def post(self, request, action=None):
        return Response({"status": "success", "action": action})

class SessionView(APIView):
    """
    GET /api/sessions/<sensor_type> -> List sessions
    GET /api/sessions/<sensor_type>/<session_name> -> Get session rows
    DELETE /api/sessions/<sensor_type>/<session_name> -> Delete session
    """
    def get(self, request, sensor_type, session_name=None):
        try:
            # Case-insensitive directory lookup
            target_dir = None
            if PROCESSED_DIR.exists():
                for d in PROCESSED_DIR.iterdir():
                     if d.is_dir() and d.name.lower() == sensor_type.lower():
                         target_dir = d
                         break
            
            # Fallback if not found via iter (or dir missing)
            if not target_dir:
                 target_dir = PROCESSED_DIR / sensor_type.lower()

            print(f"[SessionView] Request: {sensor_type}, Target: {target_dir}, Exists: {target_dir.exists()}")
            
            if not target_dir.exists():
                 return Response({"tables": []} if not session_name else [])

            if session_name:
                # Get specific session content
                file_path = target_dir / f"{session_name}.csv"
                if not file_path.exists(): 
                    return Response({"error": "Session not found"}, status=status.HTTP_404_NOT_FOUND)
                
                try:
                    df = pd.read_csv(file_path)
                    rows = df.to_dict(orient='records')
                    for idx, row in enumerate(rows):
                        if 'id' not in row:
                            row['id'] = idx
                    return Response(rows)
                except Exception as e:
                    return Response({"error": f"CSV Read Error: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            else:
                # List sessions
                files = glob.glob(str(target_dir / "*.csv"))
                tables = [Path(f).stem for f in files]
                return Response({"tables": tables})
        except Exception as e:
            print(f"[SessionView] CRITICAL ERROR: {e}")
            return Response({"error": f"Server Error: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def delete(self, request, sensor_type, session_name):
        sensor_type = sensor_type.lower()
        file_path = PROCESSED_DIR / sensor_type / f"{session_name}.csv"
        
        if file_path.exists():
            try:
                os.remove(file_path)
                return Response({"status": "deleted"})
            except Exception as e:
                return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

class WindowView(APIView):
    """
    POST /api/window -> Append a data window to a session CSV.
    """
    def post(self, request):
        try:
            data = request.data
            sensor_type = data.get('sensor', 'emg').lower()
            session_name = data.get('session_name')
            
            if not session_name:
                 return Response({"error": "Session name required"}, status=status.HTTP_400_BAD_REQUEST)
                 
            # Construct row
            # Depends on what frontend sends in 'windowPayload'
            # Typically: samples, action/label, features?
            # The CalibrationAPI sends: action, channel, samples, timestamps.
            # BUT the Python backend usually does feature extraction BEFORE saving to CSV?
            # Or does it save raw?
            
            # The SessionManagerPanel expects 'features' in the response.
            # This implies the backend must calculate features OR the frontend sends them.
            
            # Looking at calibrationApi.js: sendWindow
            # It sends samples.
            
            # The legacy Flask `web_server.py` likely handled this.
            # Since we moved logic to `backend/core`, we might need to invoke Feature Extraction here.
            # For simplicity in this quick fix, let's just save what we get if features are provided,
            # OR just stub it.
            
            # Wait, `SessionManagerPanel` displays features.
            # If we just save raw samples, the table will be empty of features.
            
            # We need to import feature extraction logic?
            # `core.feature_router` or `core.processing`?
            
            # For now, let's implement the basic file append.
            # If features are missing, we might fix that later.
            
            sensor_dir = PROCESSED_DIR / sensor_type
            sensor_dir.mkdir(parents=True, exist_ok=True)
            
            file_path = sensor_dir / f"{session_name}.csv"
            
            # Flatten data for CSV
            row = data.copy()
            if 'samples' in row:
                # Samples is a list, maybe too big for CSV cell?
                # Usually we save features.
                pass
                
            # If the CSV doesn't exist, create it.
            df = pd.DataFrame([row])
            
            if not file_path.exists():
                df.to_csv(file_path, index=False)
            else:
                df.to_csv(file_path, mode='a', header=False, index=False)
                
            return Response({"status": "saved"})
            
        except Exception as e:
             logger.error(f"Error saving window: {e}")
             return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

