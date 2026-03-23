import time
import json
import collections
import numpy as np
from scipy.signal import butter, filtfilt, welch, detrend
from sklearn.cross_decomposition import CCA
from scipy import stats as scipy_stats
from src.server.server.state import state
from src.server.server.config_manager import load_config
from src.server.server.session_manager import SessionManager

from src.feature.extractors.rps_extractor import RPSExtractor
from src.feature.extractors.blink_extractor import BlinkExtractor

try:
    import pylsl
    LSL_AVAILABLE = True
except Exception as e:
    print(f"Warning: pylsl not available: {e}")
    LSL_AVAILABLE = False

RAW_STREAM_NAME = "BioSignals-Processed"
EVENT_STREAM_NAME = "BioSignals-Events"

# Helper for features
def extract_emg_features(samples: list, sr: int = 1000) -> dict:
    """Extract EMG features matching RPSExtractor."""
    return RPSExtractor.extract_features(samples, sr)

def extract_eog_features(samples: list, sr: int = 1000) -> dict:
    """Extract EOG blink features matching BlinkExtractor (Smart Crop)."""
    return BlinkExtractor.extract_features_smart(samples, sr)

def _generate_ssvep_reference(freq: float, sr: int, num_samples: int, num_harmonics: int) -> np.ndarray:
    t = np.arange(num_samples) / float(sr)
    refs = []
    for harmonic in range(1, num_harmonics + 1):
        refs.append(np.sin(2 * np.pi * freq * harmonic * t))
        refs.append(np.cos(2 * np.pi * freq * harmonic * t))
    return np.array(refs).T

def extract_eeg_features(samples: list, sr: int = 1000, target_freqs: list | None = None) -> dict:
    """
    Extract SSVEP-oriented EEG features suitable for later LDA training.
    Keeps legacy band-power features for compatibility while adding
    per-target correlation scores and summary statistics.
    """
    data = np.asarray(samples, dtype=float).flatten()
    if data.size == 0:
        return {}

    cfg = state.config or load_config()
    eeg_cfg = cfg.get("features", {}).get("EEG", {})
    freqs = target_freqs or eeg_cfg.get("target_freqs", [8, 10, 12, 15, 18, 20])
    freqs = [float(f) for f in freqs[:6]]
    num_harmonics = int(eeg_cfg.get("num_harmonics", 4))

    detrended = detrend(data)
    std = float(np.std(detrended))
    if std > 1e-8:
        normalized = (detrended - np.mean(detrended)) / std
    else:
        normalized = detrended - np.mean(detrended)

    bandpassed = normalized
    try:
        b, a = butter(4, [6, 60], btype='bandpass', fs=sr)
        bandpassed = filtfilt(b, a, normalized)
    except Exception:
        pass

    try:
        bn, an = butter(2, [49, 51], btype='bandstop', fs=sr)
        bandpassed = filtfilt(bn, an, bandpassed)
    except Exception:
        pass

    freqs_psd, psd = welch(bandpassed, sr, nperseg=min(len(bandpassed), max(256, len(bandpassed))))

    def band_power(low: float, high: float) -> float:
        idx = np.logical_and(freqs_psd >= low, freqs_psd <= high)
        if not np.any(idx):
            return 0.0
        return float(np.sum(psd[idx]))

    bp_delta = band_power(0.5, 4)
    bp_theta = band_power(4, 8)
    bp_alpha = band_power(8, 13)
    bp_beta = band_power(13, 30)
    bp_gamma = band_power(30, min(60, sr / 2 - 1))
    total_power = bp_delta + bp_theta + bp_alpha + bp_beta + bp_gamma

    cca = CCA(n_components=1)
    score_values = []

    filter_bands = [(6, 60), (12, 60), (18, 60), (24, 60)]
    weights = [1.0, 0.7, 0.4, 0.2]

    for target_freq in freqs:
        ref = _generate_ssvep_reference(target_freq, sr, len(bandpassed), num_harmonics)
        weighted_score = 0.0

        for (low, high), weight in zip(filter_bands, weights):
            try:
                b_sub, a_sub = butter(4, [low, min(high, sr / 2 - 1)], btype='bandpass', fs=sr)
                filtered = filtfilt(b_sub, a_sub, bandpassed).reshape(-1, 1)
                cca.fit(filtered, ref)
                x_score, y_score = cca.transform(filtered, ref)
                corr = np.corrcoef(x_score[:, 0], y_score[:, 0])[0, 1]
                if np.isfinite(corr):
                    weighted_score += weight * float(corr ** 2)
            except Exception:
                continue

        score_values.append(max(0.0, weighted_score))

    padded_scores = list(score_values[:6]) + [0.0] * max(0, 6 - len(score_values))
    scores_arr = np.asarray(padded_scores, dtype=float)
    sorted_scores = np.sort(scores_arr)
    max_score = float(sorted_scores[-1]) if sorted_scores.size else 0.0
    second_max = float(sorted_scores[-2]) if sorted_scores.size > 1 else 0.0
    dominant_idx = int(np.argmax(scores_arr)) if scores_arr.size else 0
    dominant_freq = float(freqs[dominant_idx]) if freqs else 0.0

    feature_map = {
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
        "mean": float(np.mean(bandpassed)),
        "std": float(np.std(bandpassed)),
        "max": float(np.max(bandpassed)),
        "min": float(np.min(bandpassed)),
        "score_1": float(padded_scores[0]),
        "score_2": float(padded_scores[1]),
        "score_3": float(padded_scores[2]),
        "score_4": float(padded_scores[3]),
        "score_5": float(padded_scores[4]),
        "score_6": float(padded_scores[5]),
        "max_score": max_score,
        "second_max_score": second_max,
        "score_ratio": float(max_score / second_max) if second_max > 1e-8 else float(max_score),
        "score_mean": float(np.mean(scores_arr)) if scores_arr.size else 0.0,
        "score_std": float(np.std(scores_arr)) if scores_arr.size else 0.0,
        "dominant_freq": dominant_freq,
        "sample_count": int(len(data)),
    }

    return feature_map


def create_channel_mapping(lsl_info) -> dict:
    """Create channel mapping from LSL stream info."""
    mapping = {}
    config = state.config or load_config()
    config_mapping = config.get("channel_mapping", {})

    try:
        ch_count = int(lsl_info.channel_count())
        state.sr = int(lsl_info.nominal_srate())
        state.num_channels = ch_count

        for i in range(ch_count):
            ch_key = f"ch{i}"
            
            # Get from config or use defaults
            if ch_key in config_mapping:
                ch_info = config_mapping[ch_key]
                sensor_type = ch_info.get("sensor", "UNKNOWN").upper()
                enabled = ch_info.get("enabled", True)
            else:
                sensor_type = "UNKNOWN"
                enabled = True

            mapping[i] = {
                "type": sensor_type,
                "label": f"{sensor_type}_{i}",
                "enabled": enabled
            }

    except Exception as e:
        print(f"⚠️  Error creating mapping: {e}")

    return mapping


def resolve_lsl_stream() -> bool:
    """Resolve and connect to LSL stream."""
    if not LSL_AVAILABLE:
        print("❌ pylsl not available")
        return False

    try:
        print("🔍 Searching for LSL stream...")
        streams = pylsl.resolve_streams(wait_time=0.1)
        
        target = None

        # Exact match first
        for s in streams:
            if s.name() == RAW_STREAM_NAME:
                target = s
                break

        # Heuristic match
        if not target:
            for s in streams:
                if "processed" in s.name().lower():
                    target = s
                    break

        if target:
            state.inlet = pylsl.StreamInlet(target, max_buflen=1, recover=True)
            state.channel_mapping = create_channel_mapping(state.inlet.info())
            state.connected = True
            print(f"✅ Connected to: {target.name()}")
            print(f"Channels: {state.num_channels} @ {state.sr} Hz")
            return True

        print("❌ Could not find LSL stream")
        print("Make sure filter_router is running!")
        return False

    except Exception as e:
        print(f"❌ Error resolving stream: {e}")
        return False


def resolve_event_stream() -> bool:
    """Resolve and connect to LSL Event stream."""
    if not LSL_AVAILABLE:
        return False
        
    try:
        print(f"🔍 Searching for Event stream: {EVENT_STREAM_NAME}...")
        streams = pylsl.resolve_byprop('name', EVENT_STREAM_NAME, timeout=1.0)
        
        target = None
        if streams:
            target = streams[0]
        
        if target:
            state.event_inlet = pylsl.StreamInlet(target)
            print(f"✅ Connected to Event Stream: {EVENT_STREAM_NAME}")
            return True
            
        print("ℹ️  Event stream not found")
        return False
    except Exception as e:
        print(f"❌ Error resolving event stream: {e}")
        return False

def broadcast_events(socketio):
    """Broadcast events to all connected clients."""
    print("📡 Starting event broadcast thread...")
    
    while state.running:
        if state.event_inlet is None:
            # Try to reconnect occasionally
            if not resolve_event_stream():
                socketio.sleep(2.0)
                continue

        try:
            # Pull sample (blocking for short time)
            sample, ts = state.event_inlet.pull_sample(timeout=0.1)
            
            if sample:
                raw_event = sample[0]
                try:
                    event_data = json.loads(raw_event)
                    event_name = event_data.get("event", "UNKNOWN")
                    socketio.emit('bio_event', event_data)
                except json.JSONDecodeError:
                    print(f"⚠️  Failed to parse event JSON: {raw_event}")
            
            # Explicitly yield thread control
            socketio.sleep(0.01)

        except Exception as e:
             if "timeout" not in str(e).lower():
                 print(f"⚠️  Event Loop Error: {e}", flush=True)
                 state.event_inlet = None
             socketio.sleep(0.01)

def broadcast_data(socketio):
    """Broadcast stream data to all connected clients."""
    print("📡 Starting broadcast thread (BATCHED)...")
    
    BATCH_INTERVAL = 0.033 
    last_batch_time = time.time()
    batch_buffer = []

    while state.running:
        if state.inlet is None:
            # Improved: Retry connection if lost or not found initially
            if resolve_lsl_stream():
                print("✅ Reconnected to LSL stream within broadcast loop")
            else:
                socketio.sleep(2.0) # Wait before retry
                continue

        try:
            samples, timestamps = state.inlet.pull_chunk(timeout=0.0, max_samples=1024)

            if samples:
                for sample, ts in zip(samples, timestamps):
                    if len(sample) == state.num_channels:
                        state.sample_count += 1

                        channels_data = {}
                        for ch_idx in range(state.num_channels):
                            ch_mapping = state.channel_mapping.get(ch_idx, {})
                            channels_data[ch_idx] = {
                                "label": ch_mapping.get("label", f"ch{ch_idx}"),
                                "type": ch_mapping.get("type", "UNKNOWN"),
                                "value": float(sample[ch_idx]),
                                "timestamp": ts
                            }

                        batch_buffer.append({
                            "channels": channels_data,
                            "timestamp": ts,
                            "sample_count": state.sample_count
                        })
                        
                        # --- RECORDING & PREDICTION hooks ---
                        if hasattr(state, 'session') and state.session:
                            eog_vals = []
                            emg_vals = []
                            
                            for ch_idx, data in channels_data.items():
                                stype = data['type'].upper()
                                if stype == 'EOG':
                                    eog_vals.append(data['value'])
                                elif stype == 'EMG':
                                    emg_vals.append(data['value'])
                            
                            if state.session.is_recording:
                                 if state.session.recording_type == 'EMG' and emg_vals:
                                     state.session.add_sample('EMG', emg_vals if len(emg_vals) > 1 else emg_vals[0])
                                 elif state.session.recording_type == 'EOG' and eog_vals:
                                     state.session.add_sample('EOG', eog_vals if len(eog_vals) > 1 else eog_vals[0])

                now = time.time()
                # Batch send either if enough time passed or if batch is getting large to avoid latency
                if (now - last_batch_time >= BATCH_INTERVAL) and len(batch_buffer) > 0:
                    
                    batch_payload = {
                        "stream_name": RAW_STREAM_NAME,
                        "type": "batch",
                        "samples": batch_buffer,
                        "sample_rate": state.sr,
                        "batch_size": len(batch_buffer),
                        "timestamp": now
                    }
                    
                    socketio.emit('bio_data_batch', batch_payload)
                    
                    batch_buffer = []
                    last_batch_time = now

            # Explicit thread yield. Using 0.01 (10ms) is friendlier to eventlet
            # and prevents CPU pegging, while pull_chunk handles the buffering.
            socketio.sleep(0.01)

        except Exception as e:
            if "timeout" not in str(e).lower():
                print(f"⚠️  Error broadcasting: {e}", flush=True)
            socketio.sleep(0.01)
