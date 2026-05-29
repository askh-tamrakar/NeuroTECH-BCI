import threading
import time
import uuid

from src.server.server.extensions import socketio


TRAINING_JOBS = {}
TRAINING_JOBS_LOCK = threading.Lock()


class TrainingCancelledError(Exception):
    pass


def job_snapshot(job_id):
    with TRAINING_JOBS_LOCK:
        job = TRAINING_JOBS.get(job_id)
        return dict(job) if job else None


def safe_socket_emit(event_name, payload):
    try:
        if getattr(socketio, "server", None) is not None:
            socketio.emit(event_name, payload)
            # Yield to the eventlet hub so the packet flushes over the wire
            # immediately. Without this, CPU-bound training greenlets never
            # yield and all socket events batch-deliver at the end of training,
            # making the UI appear stuck at 0% for the entire training duration.
            try:
                import eventlet
                eventlet.sleep(0)
            except Exception:
                pass
    except Exception:
        pass


def emit_job_update(job_id):
    snapshot = job_snapshot(job_id)
    if snapshot:
        safe_socket_emit("training_job_update", snapshot)


def create_training_job(sensor: str, model_name: str):
    job_id = uuid.uuid4().hex
    now = time.time()
    job = {
        "job_id": job_id,
        "status": "queued",
        "sensor": sensor,
        "model_name": model_name,
        "progress": 0.0,
        "elapsed_seconds": 0.0,
        "eta_seconds": None,
        "candidate_index": 0,
        "total_candidates": 1,
        "fold_index": 0,
        "total_folds": 0,
        "history": [],
        "result": None,
        "error": None,
        "cancel_requested": False,
        "_started_at": now,
    }
    with TRAINING_JOBS_LOCK:
        TRAINING_JOBS[job_id] = job
    emit_job_update(job_id)
    return job


def update_training_job(job_id, **updates):
    with TRAINING_JOBS_LOCK:
        job = TRAINING_JOBS.get(job_id)
        if not job:
            return None
        job.update(updates)
        started_at = job.get("_started_at", time.time())
        elapsed = max(0.0, time.time() - started_at)
        job["elapsed_seconds"] = elapsed
        progress = float(job.get("progress") or 0.0)
        if 0 < progress < 1:
            job["eta_seconds"] = max(0.0, elapsed * ((1 / progress) - 1))
        elif progress >= 1.0:
            job["eta_seconds"] = 0.0
        snapshot = dict(job)
    safe_socket_emit("training_job_update", snapshot)
    return snapshot


def finalize_training_job(job_id, *, status: str, result=None, error=None, history=None):
    return update_training_job(
        job_id,
        status=status,
        progress=1.0 if status == "completed" else (float((job_snapshot(job_id) or {}).get("progress") or 0.0) if status != "cancelled" else 0.0),
        result=result,
        error=error,
        history=history if history is not None else (job_snapshot(job_id) or {}).get("history", []),
    )


def request_training_job_cancel(job_id):
    snapshot = update_training_job(job_id, cancel_requested=True, status="cancelling")
    return snapshot


def run_training_job(job_id, trainer, trainer_kwargs, *, on_success=None):
    def progress_callback(update):
        snapshot = job_snapshot(job_id)
        if snapshot and snapshot.get("cancel_requested"):
            raise TrainingCancelledError("Training cancelled by user")
        update = dict(update or {})
        history = update.get("history")
        if history is not None:
            update["history"] = list(history)
        update_training_job(job_id, **update)

    def target():
        try:
            update_training_job(job_id, status="running")
            result = trainer(progress_callback=progress_callback, **trainer_kwargs)
            snapshot = job_snapshot(job_id)
            if snapshot and snapshot.get("cancel_requested"):
                finalize_training_job(job_id, status="cancelled", error="Training cancelled by user")
                return
            if isinstance(result, dict) and result.get("error"):
                finalize_training_job(job_id, status="failed", error=result.get("error"))
                return
            if on_success:
                on_success(result, trainer_kwargs)
            finalize_training_job(
                job_id,
                status="completed",
                result=result,
                history=result.get("training_history", []) if isinstance(result, dict) else [],
            )
        except TrainingCancelledError as exc:
            finalize_training_job(job_id, status="cancelled", error=str(exc))
        except Exception as exc:
            finalize_training_job(job_id, status="failed", error=str(exc))

    thread = threading.Thread(target=target, daemon=True)
    thread.start()
