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


def compute_sub_window_params(sr, sub_window_ms=900, parent_window_ms=1500, num_sub_windows=5):
    """Compute sample-space parameters for splitting a parent window into sub-windows.

    Returns (parent_size, sub_size, sub_step) in samples.
    """
    parent_size = int(sr * parent_window_ms / 1000)
    sub_size = int(sr * sub_window_ms / 1000)
    sub_step = (parent_size - sub_size) // (num_sub_windows - 1) if num_sub_windows > 1 else 0
    return parent_size, sub_size, sub_step


def split_parent_into_sub_windows(parent_data, sub_size, sub_step, num_sub_windows=5, min_frac=0.8):
    """Yield (sub_window_array, sub_idx) for each valid sub-window within a parent chunk.

    Args:
        parent_data: 1-D numpy array of samples making up one parent window.
        sub_size: target sub-window length in samples.
        sub_step: stride between successive sub-window starts (samples).
        num_sub_windows: number of sub-windows to attempt.
        min_frac: skip sub-windows shorter than min_frac * sub_size (tail guard).
    """
    for sub_idx in range(num_sub_windows):
        sub_start = sub_idx * sub_step
        sub_end = sub_start + sub_size
        if sub_end > len(parent_data):
            sub_end = len(parent_data)
            sub_start = max(0, sub_end - sub_size)
        sub_window = parent_data[sub_start:sub_end]
        if len(sub_window) < sub_size * min_frac:
            continue
        yield sub_window, sub_idx
