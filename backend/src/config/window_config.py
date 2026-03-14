SESSION_CONFIG = {
    "sampling_rate": 1000,
    "window_ms": 300,
    "overlap": 0.5,
    "gestures": ["rest", "rock", "paper", "scissors"],
    "windows_per_gesture": 200
}

def get_session_config():
    return SESSION_CONFIG

def calculate_window_samples(config=None):
    if not config:
        config = SESSION_CONFIG
    window_samples = int((config["window_ms"] / 1000) * config["sampling_rate"])
    stride_samples = int(window_samples * (1 - config["overlap"]))
    return window_samples, stride_samples
