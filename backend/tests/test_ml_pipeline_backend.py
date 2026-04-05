import re
import sys
import time
import uuid
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.append(str(BACKEND_ROOT))

from src.database.db_manager import db_manager
from src.learning.emg_trainer import delete_model, generate_model_id, train_emg_model
from src.server.server import create_app
from src.server.server import config_manager as server_config_manager
from src.server.server.routes.training_routes import _save_window_payload, state
from src.server.server.services.config_service import reset_runtime_config, save_runtime_config
from src.server.server.services.training_job_service import (
    create_training_job,
    job_snapshot,
    run_training_job,
)


def _cleanup_session(sensor, table_name):
    try:
        db_manager.delete_session_table(sensor, table_name)
    except Exception:
        pass


def _emg_features(base_value, trial_id):
    return {
        "trial": trial_id,
        "mav": base_value,
        "rms": base_value,
        "iemg": base_value,
        "var": base_value,
        "wl": base_value,
        "zc": base_value,
        "ssc": base_value,
        "mean_freq": base_value,
        "median_freq": base_value,
        "spectral_entropy": base_value,
        "d_mav": base_value,
        "d_rms": base_value,
        "d_iemg": base_value,
        "d_var": base_value,
        "d_wl": base_value,
        "d_zc": base_value,
        "d_ssc": base_value,
        "d_mean_freq": base_value,
        "d_median_freq": base_value,
        "d_spectral_entropy": base_value,
        "sample_count": 900,
        "window_ms": 900.0,
        "capture_window_ms": 1500.0,
        "sampling_rate": 1000.0,
        "session_window_ms": 900.0,
        "session_stride_ms": 150.0,
        "source": "unit_test",
    }


def test_generate_model_id_rolls_prefix_after_ff():
    assert generate_model_id(0, 1) == "C01F1"
    assert generate_model_id(254, 1) == "CFFF1"
    assert generate_model_id(255, 1) == "D00F1"


def test_asgi_host_exposes_docs_and_legacy_status_route():
    app = create_app()
    assert app is not None


def test_config_reset_restores_true_defaults(tmp_path, monkeypatch):
    monkeypatch.setattr(server_config_manager, "CONFIG_PATH", tmp_path / "sensor_config.json")
    monkeypatch.setattr(server_config_manager, "FILTER_CONFIG_PATH", tmp_path / "filter_config.json")
    monkeypatch.setattr(server_config_manager, "FEATURE_CONFIG_PATH", tmp_path / "feature_config.json")

    save_runtime_config({
        "sampling_rate": 777,
        "display": {"showGrid": False},
        "features": {"EMG": {"custom": {"threshold": 1.23}}},
    })

    result = reset_runtime_config()
    restored = server_config_manager.load_config()
    defaults = server_config_manager.build_default_config()

    assert result["status"] == "ok"
    assert restored["sampling_rate"] == defaults["sampling_rate"]
    assert restored["display"]["showGrid"] == defaults["display"]["showGrid"]
    assert restored.get("features", {}) == {}


def test_asgi_status_endpoint_smoke():
    pytest.importorskip("fastapi")
    pytest.importorskip("httpx")
    from fastapi.testclient import TestClient

    with TestClient(create_app()) as client:
        response = client.get("/api/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["stream_name"] == "BioSignals-Processed"
    assert "connected" in payload


def test_emg_save_window_creates_five_windows_with_shared_trial():
    session_name = f"unit_emg_{uuid.uuid4().hex[:8]}"
    table_name = f"emg_session_{session_name}"
    state.config = {"sampling_rate": 1000}
    samples = list(range(1500))

    try:
        payload = _save_window_payload({
            "sensor": "EMG",
            "action": 1,
            "samples": samples,
            "session_name": session_name,
            "metadata": {
                "windowMs": 900,
                "captureWindowMs": 1500,
                "source": "unit_test",
            },
        })

        assert payload["windows_saved"] == 5
        conn = db_manager.connect("EMG")
        try:
            columns = [row[1] for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()]
            rows = conn.execute(
                f"SELECT label, trial, d_mav, d_rms, d_iemg FROM {table_name} ORDER BY id"
            ).fetchall()
        finally:
            conn.close()

        metadata = db_manager.get_session_metadata("EMG", table_name)
        assert len(rows) == 5
        assert columns[:3] == ["id", "label", "trial"]
        assert "window_ms" not in columns
        assert "capture_window_ms" not in columns
        assert "session_stride_ms" not in columns
        assert len({row[1] for row in rows}) == 1
        assert rows[0][2] == 0.0
        assert rows[0][3] == 0.0
        assert rows[0][4] == 0.0
        assert any(abs(float(row[2])) > 0 or abs(float(row[3])) > 0 or abs(float(row[4])) > 0 for row in rows[1:])
        assert metadata["window_ms"] == 900.0
        assert metadata["capture_window_ms"] == 1500.0
        assert metadata["session_stride_ms"] == 150.0
    finally:
        _cleanup_session("EMG", table_name)


def test_train_emg_model_returns_split_history_and_session_metadata():
    session_name = f"unit_train_{uuid.uuid4().hex[:8]}"
    table_name = db_manager.create_session_table("EMG", session_name)
    model_name = f"unit_model_{uuid.uuid4().hex[:8]}"

    try:
        for label, base in ((0, 0.1), (1, 1.0), (2, 2.0), (3, 3.0)):
            for trial_offset in range(3):
                trial_id = f"AA{label:02X}{trial_offset:02X}"
                for _ in range(5):
                    db_manager.insert_emg_window(
                        _emg_features(base + (trial_offset * 0.01), trial_id),
                        label,
                        session_id=f"s-{label}-{trial_offset}",
                        table_name=table_name,
                    )

        result = train_emg_model(
            table_name=table_name,
            model_name=model_name,
            n_estimators=20,
            max_depth=4,
            min_impurity_decrease=0.0,
            train_split=0.68,
            val_split=0.17,
            test_split=0.15,
            n_folds=5,
        )

        assert result["status"] == "success"
        assert result["model_name"] == model_name
        assert result["session_name"] == table_name
        assert table_name in result["session_names"]
        assert result["split_summary"]["total_samples"] == 60
        assert result["split_summary"]["test_samples"] > 0
        assert result["k_folds"] == 5
        assert result["training_history"]
        assert re.fullmatch(r"[C-Z][0-9A-F]{2}F[0-9A-F]", result["best_fold_id"])
        assert result["hyperparameters"]["selected_hyperparameters"]["k_folds"] == 5
    finally:
        delete_model("EMG", model_name)
        _cleanup_session("EMG", table_name)


def test_train_emg_model_uses_hyperparameter_tuning_candidates():
    session_name = f"unit_tune_{uuid.uuid4().hex[:8]}"
    table_name = db_manager.create_session_table("EMG", session_name)
    model_name = f"unit_tune_model_{uuid.uuid4().hex[:8]}"

    try:
        for label, base in ((0, 0.1), (1, 1.0), (2, 2.0), (3, 3.0)):
            for trial_offset in range(3):
                trial_id = f"AC{label:02X}{trial_offset:02X}"
                for _ in range(5):
                    db_manager.insert_emg_window(
                        _emg_features(base + (trial_offset * 0.01), trial_id),
                        label,
                        session_id=f"t-{label}-{trial_offset}",
                        table_name=table_name,
                    )

        result = train_emg_model(
            table_name=table_name,
            model_name=model_name,
            n_estimators_min=10,
            n_estimators_max=20,
            max_depth_min=3,
            max_depth_max=5,
            min_impurity_decrease_min=0.0,
            min_impurity_decrease_max=0.001,
            search_resolution=2,
            train_split=0.68,
            val_split=0.17,
            test_split=0.15,
            n_folds=3,
        )

        assert result["status"] == "success"
        candidate_ids = {item["candidate_index"] for item in result["training_history"]}
        assert len(candidate_ids) > 1
        selected = result["hyperparameters"]["selected_hyperparameters"]
        assert selected["n_estimators"] in {10, 20}
        assert selected["max_depth"] in {3, 5}
        assert selected["min_impurity_decrease"] in {0.0, 0.001}
        assert selected["search_resolution"] == 2
    finally:
        delete_model("EMG", model_name)
        _cleanup_session("EMG", table_name)


def test_eog_save_window_generates_non_zero_serial_id_for_zero_like_input():
    session_name = f"unit_eog_{uuid.uuid4().hex[:8]}"
    table_name = f"eog_session_{session_name}"
    state.config = {"sampling_rate": 1000}

    try:
        payload = _save_window_payload({
            "sensor": "EOG",
            "action": 1,
            "samples": [0.0] * 800,
            "session_name": session_name,
            "metadata": {
                "serial_id": "0.00",
                "source": "unit_test",
            },
        })

        conn = db_manager.connect("EOG")
        try:
            columns = [row[1] for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()]
            rows = conn.execute(f"SELECT label, serial_id FROM {table_name} ORDER BY id").fetchall()
        finally:
            conn.close()

        assert payload["serial_id"] > 0
        assert columns[:3] == ["id", "label", "serial_id"]
        assert rows
        assert all(int(row[1]) > 0 for row in rows)
    finally:
        _cleanup_session("EOG", table_name)


def test_eeg_save_window_uses_compact_schema_and_shared_trial():
    session_name = f"unit_eeg_{uuid.uuid4().hex[:8]}"
    table_name = f"eeg_session_{session_name}"
    state.config = {"sampling_rate": 1000}
    shared_trial = "AA0DB1"

    try:
        payload_one = _save_window_payload({
            "sensor": "EEG",
            "action": "T1",
            "samples": [0.1] * 1500,
            "session_name": session_name,
            "metadata": {
                "trial": shared_trial,
                "targetFrequency": 6.33,
                "channelIndex": 0,
                "sampleCount": 1500,
                "windowMs": 1500,
                "source": "unit_test",
            },
        })
        payload_two = _save_window_payload({
            "sensor": "EEG",
            "action": "Concentration",
            "samples": [0.2] * 1500,
            "session_name": session_name,
            "metadata": {
                "trial": shared_trial,
                "targetFrequency": 6.33,
                "channelIndex": 0,
                "sampleCount": 1500,
                "windowMs": 1500,
                "source": "unit_test",
            },
        })

        conn = db_manager.connect("EEG")
        try:
            columns = [row[1] for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()]
            rows = conn.execute(
                f"SELECT label, target_frequency, trial FROM {table_name} ORDER BY id"
            ).fetchall()
        finally:
            conn.close()

        session_data = db_manager.get_session_data("EEG", table_name)
        metadata = db_manager.get_session_metadata("EEG", table_name)

        assert payload_one["trial"] == shared_trial
        assert payload_two["trial"] == shared_trial
        assert columns[:4] == ["id", "label", "target_frequency", "trial"]
        assert "channel_index" not in columns
        assert "sample_count" not in columns
        assert "window_ms" not in columns
        assert len(rows) == 2
        assert {row[2] for row in rows} == {shared_trial}
        assert {int(row[0]) for row in rows} == {1}
        assert {float(row[1]) for row in rows} == {6.33}
        assert list(session_data["rows"][0]["features"].keys())[:2] == ["target_frequency", "trial"]
        assert metadata["window_ms"] == 1500.0
        assert metadata["target_frequency"] == 6.33
        assert metadata["sample_count"] == 1500
    finally:
        _cleanup_session("EEG", table_name)


def test_train_job_endpoint_returns_job_id_and_completes():
    session_name = f"unit_job_{uuid.uuid4().hex[:8]}"
    table_name = db_manager.create_session_table("EMG", session_name)
    model_name = f"unit_job_model_{uuid.uuid4().hex[:8]}"

    try:
        for label, base in ((0, 0.1), (1, 1.0), (2, 2.0), (3, 3.0)):
            for trial_offset in range(3):
                trial_id = f"AB{label:02X}{trial_offset:02X}"
                for _ in range(5):
                    db_manager.insert_emg_window(
                        _emg_features(base + (trial_offset * 0.01), trial_id),
                        label,
                        session_id=f"job-{label}-{trial_offset}",
                        table_name=table_name,
                    )

        state.config = {"sampling_rate": 1000}
        state.rps_detector = None
        job = create_training_job("EMG", model_name)
        payload = {
            "job_id": job["job_id"],
            "status": job["status"],
        }
        run_training_job(
            job["job_id"],
            trainer=train_emg_model,
            trainer_kwargs={
                "table_name": table_name,
                "model_name": model_name,
                "n_estimators": 10,
                "max_depth": 4,
                "min_impurity_decrease": 0.0,
                "train_split": 0.68,
                "val_split": 0.17,
                "test_split": 0.15,
                "n_folds": 3,
            },
        )
        assert payload["job_id"]
        assert payload["status"] in {"queued", "running"}

        snapshot = None
        for _ in range(60):
            snapshot = job_snapshot(payload["job_id"])
            if snapshot["status"] == "completed":
                break
            assert snapshot["status"] in {"queued", "running", "finalizing"}
            time.sleep(0.2)

        assert snapshot is not None
        assert snapshot["status"] == "completed"
        assert snapshot["progress"] == 1.0
        assert snapshot["history"]
        assert snapshot["result"]["model_name"] == model_name
    finally:
        delete_model("EMG", model_name)
        _cleanup_session("EMG", table_name)
