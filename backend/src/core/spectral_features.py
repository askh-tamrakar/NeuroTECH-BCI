"""
Spectral Features Module
Computes signal power in various frequency bands using Welch's method.
Includes a sliding-window band-power smoother (inspired by CortEX BandSmoother).
"""
import numpy as np
from scipy.signal import welch

# Minimum samples needed for a meaningful PSD estimate
MIN_SAMPLES_FOR_PSD = 64

# Band definitions (Hz) — module-level for reuse by BandPowerSmoother
BAND_DEFS: dict[str, tuple[float, float]] = {
    'delta': (0.5, 4.0),
    'theta': (4.0, 8.0),
    'alpha': (8.0, 12.0),
    'beta':  (12.0, 30.0),
    'gamma': (30.0, 45.0),
}


class BandPowerSmoother:
    """Sliding-window ring-buffer smoother for absolute band powers.

    Reduces Welch PSD variance by averaging across consecutive windows.
    Inspired by the CortEX BandSmoother pattern.

    With buffer_size=32 and 0.5 s step → 16 s of smoothing history.
    """

    def __init__(self, buffer_size: int = 32):
        self._size = buffer_size
        self._idx = 0
        self._count = 0  # samples pushed (capped at _size)
        self._buffers: dict[str, np.ndarray] = {}
        self._sums: dict[str, float] = {}
        for band in BAND_DEFS:
            self._buffers[band] = np.zeros(buffer_size, dtype=np.float64)
            self._sums[band] = 0.0

    def update(self, powers: dict[str, float]) -> dict[str, float]:
        """Push new raw band powers, return smoothed values."""
        for band in BAND_DEFS:
            old = float(self._buffers[band][self._idx])
            self._sums[band] -= old
            val = float(powers.get(band, 0.0))
            self._sums[band] += val
            self._buffers[band][self._idx] = val
        self._idx = (self._idx + 1) % self._size
        if self._count < self._size:
            self._count += 1
        return self.get_smoothed()

    def get_smoothed(self) -> dict[str, float]:
        """Return current smoothed band powers (no side effects)."""
        n = max(1, self._count)
        return {band: float(self._sums[band]) / n for band in BAND_DEFS}

    def reset(self):
        """Clear all buffers (call on preset/view switch)."""
        self._idx = 0
        self._count = 0
        for band in BAND_DEFS:
            self._buffers[band].fill(0.0)
            self._sums[band] = 0.0


def compute_band_powers(data, sr=1000):
    """
    Computes absolute band powers using Welch's PSD with overlapping segments.

    Uses nperseg=min(256, len(data)//2) with 50 % overlap to reduce
    variance vs the old single-segment approach.  Falls back to a single
    segment when the window is too short.

    data: 1D array of EEG samples for a single window.
    sr: Sampling rate.
    """
    if data is None or len(data) == 0:
        return {}

    n = len(data)

    # Use overlapping segments when the window is long enough to benefit.
    if n >= MIN_SAMPLES_FOR_PSD * 2:
        nperseg = min(256, n // 2)
        noverlap = nperseg // 2
    else:
        nperseg = n
        noverlap = 0

    freqs, psd = welch(data, fs=sr, nperseg=nperseg, noverlap=noverlap)

    powers = {}
    for band_name, (low, high) in BAND_DEFS.items():
        idx_band = np.logical_and(freqs >= low, freqs <= high)
        powers[band_name] = float(np.sum(psd[idx_band]))

    # Total absolute power across all bands (proxy for signal quality)
    powers['total'] = float(np.sum(psd))

    return powers
