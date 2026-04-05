import socket
import time

from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse

from src.calibration.calibration_manager import calibration_manager
from src.database.db_manager import db_manager
from src.server.server.lsl_service import extract_emg_features
from src.server.server.services.prediction_store import (
    clear_predictions,
    delete_prediction_row,
    insert_prediction,
    list_predictions,
)
from src.server.server.state import state


prediction_bp = APIRouter()


def _error_response(error: str, status_code: int = 500, **extra):
    return JSONResponse({"error": error, **extra}, status_code=status_code)


@prediction_bp.post("/api/servo/manual")
def manual_servo_override(payload: dict | None = Body(default=None)):
    try:
        payload = payload or {}
        action = payload.get("action", "")
        angle = {"Open": 1, "Close": 97, "Snap MIDDLE": 48}.get(action, 48)

        try:
            with socket.create_connection(("127.0.0.1", 6002), timeout=1.0) as relay:
                relay.sendall(f"DEG {angle}\n".encode())
        except Exception as e:
            print(f"Failed to send manual command to relay: {e}")

        return {"status": "sent", "action": action, "angle": angle}
    except Exception as e:
        return _error_response(str(e))


@prediction_bp.post("/api/prediction/window/predict")
def predict_window(payload: dict | None = Body(default=None)):
    try:
        if not payload:
            return _error_response("No payload", 400)

        samples = payload.get("samples")
        label = payload.get("label", "Unknown")
        if not samples:
            return _error_response("No samples provided", 400)

        sr = state.config.get("sampling_rate", 1000) if state.config else 1000
        features = extract_emg_features(samples, sr)
        predicted_label = "Unknown"
        confidence = 0.0

        if state.rps_detector:
            pred, conf = state.rps_detector.predict_instant(features)
            predicted_label = pred
            confidence = float(conf)

        insert_prediction(label, predicted_label, confidence, features)
        return {
            "status": "predicted",
            "predicted_label": predicted_label,
            "confidence": confidence,
            "features": features,
            "ground_truth": label,
            "match": predicted_label == label,
        }
    except Exception as e:
        import traceback

        tb = traceback.format_exc()
        return _error_response(str(e), 500, traceback=tb)


@prediction_bp.get("/api/prediction/history")
def get_history():
    try:
        return list_predictions()
    except Exception as e:
        return _error_response(str(e))


@prediction_bp.post("/api/emg/feedback")
def save_emg_feedback(payload: dict | None = Body(default=None)):
    try:
        payload = payload or {}
        prediction = payload.get("prediction")
        corrected_label = payload.get("corrected_label") or prediction
        features = payload.get("features") or {}
        confidence = float(payload.get("confidence", 0.0) or 0.0)

        if not corrected_label or not features:
            return _error_response("prediction/corrected_label and features are required", 400)

        label_map = {"Rest": 0, "Rock": 1, "Paper": 2, "Scissors": 3}
        save_label = label_map.get(str(corrected_label), 0)
        corrected_int = label_map.get(str(corrected_label), 0)

        save_features = dict(features)
        save_features["timestamp"] = time.time()
        save_features["confidence"] = confidence
        save_features["source"] = "feedback"
        save_features["corrected_label"] = corrected_int if corrected_label != prediction else None

        db_manager.insert_emg_window(
            save_features,
            save_label,
            session_id=f"feedback_{int(time.time())}",
            table_name="emg_windows",
        )

        try:
            calibration_manager.update_emg_running_stats(save_features)
        except Exception:
            pass

        return {"status": "saved", "label": corrected_label, "prediction": prediction}
    except Exception as e:
        import traceback

        tb = traceback.format_exc()
        return _error_response(str(e), 500, traceback=tb)


@prediction_bp.post("/api/eog/feedback")
def save_eog_feedback(payload: dict | None = Body(default=None)):
    try:
        payload = payload or {}
        prediction = payload.get("prediction")
        corrected_label = payload.get("corrected_label") or prediction
        features = payload.get("features") or {}
        confidence = float(payload.get("confidence", 0.0) or 0.0)

        if not corrected_label or not features:
            return _error_response("prediction/corrected_label and features are required", 400)

        label_map = {"Rest": 0, "SingleBlink": 1, "DoubleBlink": 2}
        save_label = label_map.get(str(corrected_label), 0)
        corrected_int = label_map.get(str(corrected_label), 0)

        save_features = dict(features)
        save_features["timestamp"] = time.time()
        save_features["confidence"] = confidence
        save_features["source"] = "feedback"
        save_features["corrected_label"] = corrected_int if corrected_label != prediction else None

        db_manager.insert_eog_window(
            save_features,
            save_label,
            session_id=f"feedback_{int(time.time())}",
            table_name="eog_windows",
        )

        try:
            calibration_manager.update_eog_running_stats(save_features)
        except Exception:
            pass

        return {"status": "saved", "label": corrected_label, "prediction": prediction}
    except Exception as e:
        import traceback

        tb = traceback.format_exc()
        return _error_response(str(e), 500, traceback=tb)


@prediction_bp.get("/api/prediction/sessions")
def get_sessions_mock():
    return {"tables": ["prediction_session_History"]}


@prediction_bp.get("/api/prediction/sessions/{session_name:path}")
def get_session_details(session_name):
    del session_name
    return get_history()


@prediction_bp.delete("/api/prediction/sessions/{session_name:path}/rows/{row_id}")
def delete_row(session_name, row_id):
    del session_name
    try:
        delete_prediction_row(row_id)
        return {"status": "deleted"}
    except Exception as e:
        return _error_response(str(e))


@prediction_bp.delete("/api/prediction/sessions/{session_name:path}")
def clear_history(session_name):
    del session_name
    try:
        clear_predictions()
        return {"status": "cleared"}
    except Exception as e:
        return _error_response(str(e))
