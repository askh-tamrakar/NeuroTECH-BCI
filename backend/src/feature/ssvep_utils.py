import numpy as np
from scipy.signal import butter, detrend, filtfilt, welch
from sklearn.cross_decomposition import CCA


DEFAULT_TARGET_FREQS = [6.59, 9.0, 12.0, 14.4, 16.0, 18.0]
FILTER_BANKS = [(6, 60), (12, 60), (18, 60), (24, 60)]
FILTER_WEIGHTS = [1.0, 0.7, 0.4, 0.2]


def generate_reference(freq: float, sr: int, num_samples: int, num_harmonics: int) -> np.ndarray:
    t = np.arange(num_samples, dtype=float) / float(sr)
    refs = []
    for harmonic in range(1, num_harmonics + 1):
        refs.append(np.sin(2 * np.pi * freq * harmonic * t))
        refs.append(np.cos(2 * np.pi * freq * harmonic * t))
    return np.array(refs).T


def _band_power(freqs: np.ndarray, psd: np.ndarray, low: float, high: float) -> float:
    idx = np.logical_and(freqs >= low, freqs <= high)
    if not np.any(idx):
        return 0.0
    return float(np.sum(psd[idx]))


def compute_ssvep_features(samples, sr: int = 1000, target_freqs=None, num_harmonics: int = 4) -> dict:
    data = np.asarray(samples, dtype=float).flatten()
    if data.size == 0:
        return {}

    targets = [float(freq) for freq in (target_freqs or DEFAULT_TARGET_FREQS)[:6]]

    centered = detrend(data)
    std = float(np.std(centered))
    if std > 1e-8:
        normalized = (centered - np.mean(centered)) / std
    else:
        normalized = centered - np.mean(centered)

    filtered_signal = normalized
    try:
        b_bp, a_bp = butter(4, [6, 60], btype='bandpass', fs=sr)
        filtered_signal = filtfilt(b_bp, a_bp, normalized)
    except Exception:
        pass

    try:
        b_notch, a_notch = butter(2, [49, 51], btype='bandstop', fs=sr)
        filtered_signal = filtfilt(b_notch, a_notch, filtered_signal)
    except Exception:
        pass

    freqs_psd, psd = welch(filtered_signal, sr, nperseg=min(len(filtered_signal), max(256, len(filtered_signal))))
    bp_delta = _band_power(freqs_psd, psd, 0.5, 4)
    bp_theta = _band_power(freqs_psd, psd, 4, 8)
    bp_alpha = _band_power(freqs_psd, psd, 8, 13)
    bp_beta = _band_power(freqs_psd, psd, 13, 30)
    bp_gamma = _band_power(freqs_psd, psd, 30, min(60, sr / 2 - 1))
    total_power = bp_delta + bp_theta + bp_alpha + bp_beta + bp_gamma

    cca = CCA(n_components=1)
    score_values = []

    for target_freq in targets:
        ref = generate_reference(target_freq, sr, len(filtered_signal), num_harmonics)
        weighted_score = 0.0

        for (low, high), weight in zip(FILTER_BANKS, FILTER_WEIGHTS):
            try:
                b_sub, a_sub = butter(4, [low, min(high, sr / 2 - 1)], btype='bandpass', fs=sr)
                subband = filtfilt(b_sub, a_sub, filtered_signal).reshape(-1, 1)
                cca.fit(subband, ref)
                x_score, y_score = cca.transform(subband, ref)
                corr = np.corrcoef(x_score[:, 0], y_score[:, 0])[0, 1]
                if np.isfinite(corr):
                    weighted_score += weight * float(corr ** 2)
            except Exception:
                continue

        score_values.append(max(0.0, weighted_score))

    padded_scores = list(score_values[:6]) + [0.0] * max(0, 6 - len(score_values))
    scores_arr = np.asarray(padded_scores, dtype=float)
    score_sum = float(np.sum(scores_arr))
    normalized_scores = (scores_arr / score_sum) if score_sum > 1e-12 else scores_arr
    sorted_scores = np.sort(scores_arr)
    max_score = float(sorted_scores[-1]) if sorted_scores.size else 0.0
    second_max = float(sorted_scores[-2]) if sorted_scores.size > 1 else 0.0
    dominant_idx = int(np.argmax(scores_arr)) if scores_arr.size else 0
    dominant_freq = float(targets[dominant_idx]) if targets else 0.0

    feature_map = {
        "raw_window": data.tolist(),
        "bp_delta": float(bp_delta),
        "bp_theta": float(bp_theta),
        "bp_alpha": float(bp_alpha),
        "bp_beta": float(bp_beta),
        "bp_gamma": float(bp_gamma),
        "rel_delta": float(bp_delta / total_power) if total_power > 0 else 0.0,
        "rel_theta": float(bp_theta / total_power) if total_power > 0 else 0.0,
        "rel_alpha": float(bp_alpha / total_power) if total_power > 0 else 0.0,
        "rel_beta": float(bp_beta / total_power) if total_power > 0 else 0.0,
        "rel_gamma": float(bp_gamma / total_power) if total_power > 0 else 0.0,
        "mean": float(np.mean(filtered_signal)),
        "std": float(np.std(filtered_signal)),
        "max": float(np.max(filtered_signal)),
        "min": float(np.min(filtered_signal)),
        "score_1": float(normalized_scores[0]),
        "score_2": float(normalized_scores[1]),
        "score_3": float(normalized_scores[2]),
        "score_4": float(normalized_scores[3]),
        "score_5": float(normalized_scores[4]),
        "score_6": float(normalized_scores[5]),
        "max_score": max_score,
        "second_max_score": second_max,
        "score_ratio": float(max_score / second_max) if second_max > 1e-8 else float(max_score),
        "score_mean": float(np.mean(scores_arr)) if scores_arr.size else 0.0,
        "score_std": float(np.std(scores_arr)) if scores_arr.size else 0.0,
        "dominant_freq": dominant_freq,
        "sample_count": int(len(data)),
        "target_freqs": targets,
        "score_vector": scores_arr.tolist(),
        "normalized_score_vector": normalized_scores.tolist(),
    }

    return feature_map

