SESSION_CONFIG = {
    "sampling_rate": 1000,
    "window_ms": 300,
    "overlap": 0.5,
}


def get_window_samples(session_config: dict | None = None) -> tuple[int, int]:
    cfg = session_config or SESSION_CONFIG
    sampling_rate = int(cfg["sampling_rate"])
    window_ms = float(cfg["window_ms"])
    overlap = float(cfg["overlap"])

    window_samples = max(1, int((window_ms / 1000.0) * sampling_rate))
    stride_samples = max(1, int(window_samples * (1.0 - overlap)))
    return window_samples, stride_samples
