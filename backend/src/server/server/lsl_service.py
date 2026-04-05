import asyncio
import json
import time

from src.feature.extractors.blink_extractor import BlinkExtractor
from src.feature.extractors.rps_extractor import RPSExtractor
from src.feature.ssvep_utils import DEFAULT_TARGET_FREQS, compute_ssvep_features
from src.server.server.config_manager import load_config
from src.server.server.state import state

try:
    import pylsl

    LSL_AVAILABLE = True
except Exception as e:
    print(f"Warning: pylsl not available: {e}")
    LSL_AVAILABLE = False


RAW_STREAM_NAME = "BioSignals-Processed"
EVENT_STREAM_NAME = "BioSignals-Events"


def extract_emg_features(samples: list, sr: int = 1000, prev_features: dict | None = None) -> dict:
    """Extract EMG features matching RPSExtractor."""
    return RPSExtractor.extract_features(samples, sr, prev_features=prev_features)


def extract_eog_features(samples: list, sr: int = 1000) -> dict:
    """Extract EOG blink features matching BlinkExtractor (Smart Crop)."""
    return BlinkExtractor.extract_features_smart(samples, sr)


def extract_eeg_features(samples: list, sr: int = 1000, target_freqs: list | None = None) -> dict:
    cfg = state.config or load_config()
    eeg_cfg = cfg.get("features", {}).get("EEG", {})
    freqs = target_freqs or eeg_cfg.get("target_freqs", DEFAULT_TARGET_FREQS)
    num_harmonics = int(eeg_cfg.get("num_harmonics", 4))
    return compute_ssvep_features(samples, sr=sr, target_freqs=freqs, num_harmonics=num_harmonics)


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
                "enabled": enabled,
            }

    except Exception as e:
        print(f"Error creating mapping: {e}")

    return mapping


def resolve_lsl_stream() -> bool:
    """Resolve and connect to the primary LSL stream."""
    if not LSL_AVAILABLE:
        print("pylsl not available")
        return False

    try:
        print("Searching for LSL stream...")
        streams = pylsl.resolve_streams(wait_time=0.1)
        target = None

        for stream in streams:
            if stream.name() == RAW_STREAM_NAME:
                target = stream
                break

        if not target:
            for stream in streams:
                if "processed" in stream.name().lower():
                    target = stream
                    break

        if not target:
            print("Could not find LSL stream. Make sure filter_router is running.")
            state.connected = False
            return False

        state.inlet = pylsl.StreamInlet(target, max_buflen=1, recover=True)
        state.channel_mapping = create_channel_mapping(state.inlet.info())
        state.connected = True
        print(f"Connected to: {target.name()}")
        print(f"Channels: {state.num_channels} @ {state.sr} Hz")
        return True

    except Exception as e:
        print(f"Error resolving stream: {e}")
        state.connected = False
        state.inlet = None
        return False


def resolve_event_stream() -> bool:
    """Resolve and connect to the event LSL stream."""
    if not LSL_AVAILABLE:
        return False

    try:
        print(f"Searching for Event stream: {EVENT_STREAM_NAME}...")
        streams = pylsl.resolve_byprop("name", EVENT_STREAM_NAME, timeout=1.0)
        target = streams[0] if streams else None

        if not target:
            print("Event stream not found")
            state.event_inlet = None
            return False

        state.event_inlet = pylsl.StreamInlet(target)
        print(f"Connected to Event Stream: {EVENT_STREAM_NAME}")
        return True

    except Exception as e:
        print(f"Error resolving event stream: {e}")
        state.event_inlet = None
        return False


async def broadcast_events(socketio):
    """Broadcast decoded event messages to all connected clients."""
    print("Starting event broadcast task...")

    while state.running:
        if state.event_inlet is None:
            if not await asyncio.to_thread(resolve_event_stream):
                await asyncio.sleep(2.0)
                continue

        try:
            sample, ts = await asyncio.to_thread(state.event_inlet.pull_sample, timeout=0.1)
            del ts

            if sample:
                raw_event = sample[0]
                try:
                    event_data = json.loads(raw_event)
                    await socketio.emit_async("bio_event", event_data)
                except json.JSONDecodeError:
                    print(f"Failed to parse event JSON: {raw_event}")

            await asyncio.sleep(0.01)

        except asyncio.CancelledError:
            raise
        except (ConnectionResetError, BrokenPipeError):
            await asyncio.sleep(0.1)
        except Exception as e:
            err_str = str(e).lower()
            if "timeout" not in err_str and "10054" not in err_str:
                print(f"Event loop error: {e}", flush=True)
                state.event_inlet = None
            await asyncio.sleep(0.01)


async def broadcast_data(socketio):
    """Broadcast batched biosignal samples to all connected clients."""
    print("Starting broadcast task (batched)...")

    batch_interval = 0.033
    last_batch_time = time.time()
    batch_buffer = []

    while state.running:
        if state.inlet is None:
            if await asyncio.to_thread(resolve_lsl_stream):
                print("Reconnected to LSL stream within broadcast loop")
            else:
                await asyncio.sleep(2.0)
                continue

        try:
            samples, timestamps = await asyncio.to_thread(
                state.inlet.pull_chunk,
                timeout=0.0,
                max_samples=1024,
            )

            if samples:
                for sample, ts in zip(samples, timestamps):
                    if len(sample) != state.num_channels:
                        continue

                    state.sample_count += 1
                    channels_data = {}
                    for ch_idx in range(state.num_channels):
                        ch_mapping = state.channel_mapping.get(ch_idx, {})
                        channels_data[ch_idx] = {
                            "label": ch_mapping.get("label", f"ch{ch_idx}"),
                            "type": ch_mapping.get("type", "UNKNOWN"),
                            "value": float(sample[ch_idx]),
                            "timestamp": ts,
                        }

                    batch_buffer.append(
                        {
                            "channels": channels_data,
                            "timestamp": ts,
                            "sample_count": state.sample_count,
                        }
                    )

                    try:
                        mode_channel_idx = 0
                        if getattr(state, "mode_manager", None):
                            mode_channel_idx = state.mode_manager.get_channel_index()
                        ch_val = channels_data[mode_channel_idx]["value"] if mode_channel_idx in channels_data else 0.0
                        mode_result = state.mode_manager.process_sample([ch_val])
                        if mode_result:
                            await socketio.emit_async("eeg_mode_result", mode_result)
                    except Exception as e:
                        print(f"ModeManager Error: {e}", flush=True)

                    if getattr(state, "session", None):
                        eog_vals = []
                        emg_vals = []
                        eeg_vals = []

                        for _, data in channels_data.items():
                            stype = data["type"].upper()
                            if stype == "EOG":
                                eog_vals.append(data["value"])
                            elif stype == "EMG":
                                emg_vals.append(data["value"])
                            elif stype == "EEG":
                                eeg_vals.append(data["value"])

                        if state.session.is_recording:
                            if state.session.recording_type == "EMG" and emg_vals:
                                state.session.add_sample("EMG", emg_vals if len(emg_vals) > 1 else emg_vals[0])
                            elif state.session.recording_type == "EOG" and eog_vals:
                                state.session.add_sample("EOG", eog_vals if len(eog_vals) > 1 else eog_vals[0])
                            elif state.session.recording_type == "EEG" and eeg_vals:
                                state.session.add_sample("EEG", eeg_vals)

                now = time.time()
                if (now - last_batch_time >= batch_interval) and batch_buffer:
                    batch_payload = {
                        "stream_name": RAW_STREAM_NAME,
                        "type": "batch",
                        "samples": batch_buffer,
                        "sample_rate": state.sr,
                        "batch_size": len(batch_buffer),
                        "timestamp": now,
                    }
                    await socketio.emit_async("bio_data_batch", batch_payload)
                    batch_buffer = []
                    last_batch_time = now

            await asyncio.sleep(0.01)

        except asyncio.CancelledError:
            raise
        except (ConnectionResetError, BrokenPipeError):
            await asyncio.sleep(0.1)
        except Exception as e:
            err_str = str(e).lower()
            if "timeout" not in err_str and "10054" not in err_str:
                print(f"Error broadcasting: {e}", flush=True)
            await asyncio.sleep(0.01)
