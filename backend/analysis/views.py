from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings
from core.utils.config import config_manager
from core.database.db_manager import db_manager
from core.learning.emg_trainer import train_emg_model, evaluate_saved_model as evaluate_emg_model
from core.learning.eog_trainer import train_eog_model, evaluate_saved_eog_model as evaluate_eog_model
from core.processing.pipeline import ProcessingPipeline
from core.feature.extractors.rps_extractor import RPSExtractor
from core.feature.extractors.blink_extractor import BlinkExtractor
import pandas as pd
import logging
import numpy as np

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

# ... (keep other imports)

class SessionView(APIView):
    """
    GET /api/sessions/<sensor_type>/ -> List sessions
    GET /api/sessions/<sensor_type>/<session_name>/ -> Get session rows
    DELETE /api/sessions/<sensor_type>/<session_name>/ -> Delete session
    """
    def get(self, request, sensor_type, session_name=None):
        try:
            if session_name:
                rows = db_manager.get_session_data(sensor_type, session_name)
                return Response(rows)
            else:
                tables = db_manager.get_session_tables(sensor_type)
                return Response({"tables": tables})
        except Exception as e:
            logger.error(f"Error in SessionView GET: {e}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def delete(self, request, sensor_type, session_name):
        try:
            if db_manager.delete_session_table(sensor_type, session_name):
                return Response({"status": "deleted"})
            else:
                return Response({"error": "Failed to delete session"}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Error in SessionView DELETE: {e}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class WindowView(APIView):
    """
    POST /api/window/ -> Append a data window to a session table.
    """
    def post(self, request):
        try:
            data = request.data
            sensor_type = data.get('sensor', 'emg').upper()
            session_name = data.get('session_name')
            samples_raw = data.get('samples')
            timestamps_raw = data.get('timestamps')

            if not session_name:
                return Response({"error": "Session name required"}, status=status.HTTP_400_BAD_REQUEST)
            if not samples_raw:
                return Response({"error": "Samples data required"}, status=status.HTTP_400_BAD_REQUEST)

            # Sanitize and create the table if it doesn't exist
            table_name = db_manager.create_session_table(sensor_type, session_name)

            # Convert samples to numpy array for processing
            samples_np = np.array(samples_raw)

            # Initialize pipeline to get sensor config and sampling rate
            pipeline = ProcessingPipeline()
            sr = pipeline.sr # Get sampling rate from pipeline config

            features = {}
            if sensor_type == 'EMG':
                features = RPSExtractor.extract_features(samples_np, sr)
            elif sensor_type == 'EOG':
                features = BlinkExtractor.extract_features(samples_np, sr)
            # Add other sensor types as needed

            if not features:
                return Response({"error": "Feature extraction failed"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            # Add timestamp to features for consistency
            if timestamps_raw and len(timestamps_raw) > 0:
                features['timestamp'] = timestamps_raw[-1]
            else:
                features['timestamp'] = Date.now() # Fallback, though should be provided by frontend

            # Insert the window data
            if sensor_type == 'EMG':
                db_manager.insert_window(features, data.get('action', -1), session_id=session_name, table_name=table_name)
            elif sensor_type == 'EOG':
                db_manager.insert_eog_window(features, data.get('action', -1), session_id=session_name, table_name=table_name)
            else:
                logger.warn(f"Window saving for sensor type {sensor_type} not fully implemented or features not inserted.")
                return Response({"error": f"Unsupported sensor type {sensor_type} for feature extraction/saving"}, status=status.HTTP_400_BAD_REQUEST)

            # Respond with the extracted features for the frontend to update its state
            return Response({"status": "saved", "table_name": table_name, "features": features})

        except Exception as e:
            logger.error(f"Error in WindowView: {e}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@method_decorator(csrf_exempt, name='dispatch')
class TrainEmgView(APIView):
    def post(self, request):
        try:
            params = request.data
            result = train_emg_model(
                n_estimators=params.get('n_estimators', 100),
                max_depth=params.get('max_depth', None),
                test_size=params.get('test_size', 0.2),
                table_name=params.get('table_name') # Pass None if not provided to use default
            )
            return Response(result)
        except Exception as e:
            return Response({"error": str(e)}, status=500)

@method_decorator(csrf_exempt, name='dispatch')
class EvaluateModelView(APIView):
    def post(self, request):
        try:
            table_name = request.data.get('table_name')
            result = evaluate_emg_model(table_name=table_name)
            return Response(result)
        except Exception as e:
            return Response({"error": str(e)}, status=500)

@method_decorator(csrf_exempt, name='dispatch')
class TrainEogView(APIView):
    def post(self, request):
        try:
            params = request.data
            result = train_eog_model(
                n_estimators=params.get('n_estimators', 50),
                max_depth=params.get('max_depth', 5),
                test_size=params.get('test_size', 0.2),
                table_name=params.get('table_name')
            )
            return Response(result)
        except Exception as e:
            return Response({"error": str(e)}, status=500)

@method_decorator(csrf_exempt, name='dispatch')
class EvaluateEogView(APIView):
    def post(self, request):
        try:
            table_name = request.data.get('table_name')
            result = evaluate_eog_model(table_name=table_name)
            return Response(result)
        except Exception as e:
            return Response({"error": str(e)}, status=500)

@method_decorator(csrf_exempt, name='dispatch')
class StartCalibrationView(APIView):
    def post(self, request):
        # Placeholder for starting calibration logic
        return Response({"success": True, "sessionId": "mock_session_123"})

@method_decorator(csrf_exempt, name='dispatch')
class StopCalibrationView(APIView):
    def post(self, request):
        # Placeholder for stopping calibration logic
        return Response({"success": True})

@method_decorator(csrf_exempt, name='dispatch')
class RunCalibrationView(APIView):
    def post(self, request):
        # Placeholder for running calibration logic
        return Response({"recommendations": {}, "summary": {"total": 0, "correct": 0, "missed": 0}})