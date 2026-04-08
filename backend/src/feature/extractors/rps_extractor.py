import collections
import numpy as np
from scipy import stats
from scipy.signal import butter, lfilter

from src.config.window_config import SESSION_CONFIG, get_window_samples


EMG_BASE_FEATURES = [
    "mav",
    "rms",
    "iemg",
    "var",
    "wl",
    "zc",
    "ssc",
    "mean_freq",
    "median_freq",
    "spectral_entropy",
]

EMG_FEATURE_COLUMNS = EMG_BASE_FEATURES + [f"d_{name}" for name in EMG_BASE_FEATURES]


def _safe_div(num: float, den: float) -> float:
    return float(num / den) if abs(den) > 1e-12 else 0.0


def _zero_crossings(signal: np.ndarray, threshold: float = 1e-6) -> float:
    centered = signal.copy()
    centered[np.abs(centered) < threshold] = 0.0
    return float(np.sum((centered[:-1] * centered[1:]) < 0))


def _slope_sign_changes(signal: np.ndarray, threshold: float = 1e-6) -> float:
    if signal.size < 3:
        return 0.0
    diff = np.diff(signal)
    return float(np.sum((diff[:-1] * diff[1:]) < -threshold))


def _median_frequency(freqs: np.ndarray, power: np.ndarray) -> float:
    total_power = float(np.sum(power))
    if total_power <= 0:
        return 0.0
    cumulative = np.cumsum(power)
    idx = int(np.searchsorted(cumulative, total_power * 0.5, side="left"))
    idx = min(idx, len(freqs) - 1)
    return float(freqs[idx])


def _spectral_entropy(power: np.ndarray) -> float:
    power_sum = float(np.sum(power))
    if power_sum <= 0:
        return 0.0
    prob = power / power_sum
    prob = prob[prob > 0]
    if prob.size == 0:
        return 0.0
    return float(-np.sum(prob * np.log2(prob)))


def _compute_envelope(raw_signal: np.ndarray, sr: int, cutoff_hz: float = 8.0) -> np.ndarray:
    if raw_signal.size == 0:
        return raw_signal
    rectified = np.abs(raw_signal)
    nyq = sr / 2.0
    wn = min(max(cutoff_hz / nyq, 1e-6), 0.99)
    b, a = butter(4, wn, btype="low", analog=False)
    return lfilter(b, a, rectified)


class RPSExtractor:
    """
    Fixed-window EMG feature extractor for Rock/Paper/Scissors.
    The extractor consumes the filtered EMG stream and derives an envelope per
    window so training and real-time detection share the same feature recipe.
    """

    FEATURE_COLUMNS = EMG_FEATURE_COLUMNS

    def __init__(self, channel_index: int, config: dict, sr: int):
        self.channel_index = channel_index
        self.sr = int(sr)

        session_cfg = dict(SESSION_CONFIG)
        session_cfg["sampling_rate"] = self.sr
        self.window_size, self.stride = get_window_samples(session_cfg)

        self.buffer = collections.deque(maxlen=self.window_size)
        self.sample_count = 0
        self.prev_features = None

    def process(self, sample_val: float):
        self.buffer.append(float(sample_val))
        self.sample_count += 1

        if len(self.buffer) == self.window_size and self.sample_count % self.stride == 0:
            return self._extract_features(np.asarray(self.buffer, dtype=float))

        return None

    @staticmethod
    def extract_features(
        raw_signal: list | np.ndarray,
        sr: int = 1000,
        prev_features: dict | None = None,
    ) -> dict:
        if raw_signal is None or len(raw_signal) == 0:
            return {}

        raw = np.nan_to_num(np.asarray(raw_signal, dtype=float), nan=0.0, posinf=0.0, neginf=0.0)
        envelope = _compute_envelope(raw, sr)

        mav = float(np.mean(np.abs(envelope)))
        rms = float(np.sqrt(np.mean(envelope ** 2)))
        iemg = float(np.sum(np.abs(envelope)))
        var = float(np.var(envelope))

        wl = float(np.sum(np.abs(np.diff(raw)))) if raw.size > 1 else 0.0
        zc = _zero_crossings(raw)
        ssc = _slope_sign_changes(raw)

        fft_vals = np.fft.rfft(raw)
        power = np.abs(fft_vals) ** 2
        freqs = np.fft.rfftfreq(raw.size, d=1.0 / sr)
        total_power = float(np.sum(power))

        mean_freq = _safe_div(float(np.sum(freqs * power)), total_power)
        median_freq = _median_frequency(freqs, power)
        spectral_entropy = _spectral_entropy(power)

        base_features = {
            "mav": mav,
            "rms": rms,
            "iemg": iemg,
            "var": var,
            "wl": wl,
            "zc": zc,
            "ssc": ssc,
            "mean_freq": mean_freq,
            "median_freq": median_freq,
            "spectral_entropy": spectral_entropy,
        }

        features = {}
        for key in EMG_BASE_FEATURES:
            value = np.nan_to_num(base_features[key], nan=0.0, posinf=1e6, neginf=-1e6)
            features[key] = float(value)

        if prev_features:
            for key in EMG_BASE_FEATURES:
                prev_val = float(prev_features.get(key, 0.0))
                features[f"d_{key}"] = float(features[key] - prev_val)
        else:
            for key in EMG_BASE_FEATURES:
                features[f"d_{key}"] = 0.0

        # Legacy compatibility fields still used in a few old paths/UI panels.
        features["peak"] = float(np.max(np.abs(raw))) if raw.size else 0.0
        features["range"] = float(np.ptp(raw)) if raw.size else 0.0
        features["energy"] = float(np.sum(raw ** 2))
        features["entropy"] = spectral_entropy
        features["kurtosis"] = float(np.nan_to_num(stats.kurtosis(raw), nan=0.0))
        features["skewness"] = float(np.nan_to_num(stats.skew(raw), nan=0.0))
        features["wamp"] = float(np.sum(np.abs(np.diff(raw)) > 1e-6)) if raw.size > 1 else 0.0

        return features

    def _extract_features(self, raw_window: np.ndarray):
        features = RPSExtractor.extract_features(raw_window, self.sr, prev_features=self.prev_features)
        features["timestamp"] = self.sample_count / self.sr
        self.prev_features = {key: features[key] for key in EMG_BASE_FEATURES}
        return features

    def update_config(self, config: dict):
        session_cfg = dict(SESSION_CONFIG)
        session_cfg["sampling_rate"] = self.sr
        self.window_size, self.stride = get_window_samples(session_cfg)
        old_buffer = list(self.buffer)[-self.window_size:]
        self.buffer = collections.deque(old_buffer, maxlen=self.window_size)
