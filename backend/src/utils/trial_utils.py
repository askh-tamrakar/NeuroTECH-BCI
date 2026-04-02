import json
from pathlib import Path

from src.utils.paths import get_runtime_state_dir


TRIAL_STATE_PATH = get_runtime_state_dir() / "trial_state.json"
DEFAULT_TRIAL_ID = "AA0FD1"


def _normalize_trial_id(value: str | None) -> str:
    raw = str(value or "").strip().upper()
    if not raw:
        return DEFAULT_TRIAL_ID
    try:
        parsed = int(raw, 16)
    except ValueError:
        parsed = int(DEFAULT_TRIAL_ID, 16)
    return f"{parsed:06X}"


def _read_state(path: Path = TRIAL_STATE_PATH) -> dict:
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def get_next_trial_id(path: Path = TRIAL_STATE_PATH) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    state = _read_state(path)
    current = _normalize_trial_id(state.get("next_trial_id"))

    try:
        next_value = int(current, 16) + 1
    except ValueError:
        current = DEFAULT_TRIAL_ID
        next_value = int(DEFAULT_TRIAL_ID, 16) + 1

    state["next_trial_id"] = f"{next_value:06X}"
    path.write_text(json.dumps(state, indent=2), encoding="utf-8")
    return current
