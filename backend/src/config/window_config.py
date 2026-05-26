SESSION_CONFIG = {
    "sampling_rate": 1000,
    "window_ms": 900,
    "overlap": 0.8333333333,
    "stride_ms": 150,
}


def get_window_samples(session_config: dict | None = None) -> tuple[int, int]:
    cfg = session_config or SESSION_CONFIG
    sampling_rate = int(cfg["sampling_rate"])
    window_ms = float(cfg["window_ms"])
    overlap = float(cfg.get("overlap", 0.0))
    stride_ms = float(cfg.get("stride_ms", 0) or 0)

    window_samples = max(1, int((window_ms / 1000.0) * sampling_rate))
    if stride_ms > 0:
        stride_samples = max(1, int((stride_ms / 1000.0) * sampling_rate))
    else:
        stride_samples = max(1, int(window_samples * (1.0 - overlap)))
    return window_samples, stride_samples
