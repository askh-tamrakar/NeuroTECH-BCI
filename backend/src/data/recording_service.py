"""
Recording Service — dedicated LSL pull thread for server-side recording.

Pulls samples directly from an LSL stream (BioSignals-Raw-uV or
BioSignals-Processed) and writes them to the HybridRecorder's CSV.
"""

import threading
import time
from typing import List, Optional

try:
    import pylsl
    LSL_AVAILABLE = True
except Exception:
    pylsl = None
    LSL_AVAILABLE = False

RAW_STREAM = "BioSignals-Raw-uV"
PROCESSED_STREAM = "BioSignals-Processed"


class RecordingService:
    """Background thread that pulls from an LSL stream into a HybridRecorder."""

    def __init__(self, recorder):
        self.recorder = recorder
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._inlet = None

    # ------------------------------------------------------------------
    #  Public API
    # ------------------------------------------------------------------
    def start(self, data_type: str = "raw", channel_indices: Optional[List[int]] = None):
        """Spin up the pull thread.  Call *after* recorder.start()."""
        if self._thread and self._thread.is_alive():
            return

        self._running = True
        self._thread = threading.Thread(
            target=self._pull_loop,
            args=(data_type, channel_indices),
            daemon=True,
        )
        self._thread.start()

    def stop(self):
        """Signal the pull thread to exit and wait for it."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=3.0)
            self._thread = None
        self._close_inlet()

    @staticmethod
    def check_stream_available(data_type: str = "raw", timeout: float = 1.5) -> bool:
        """Quick probe: is the target LSL stream resolvable right now?"""
        if not LSL_AVAILABLE:
            return False
        name = RAW_STREAM if data_type == "raw" else PROCESSED_STREAM
        try:
            streams = pylsl.resolve_byprop("name", name, timeout=timeout)
            return len(streams) > 0
        except Exception:
            return False

    # ------------------------------------------------------------------
    #  Internal pull loop
    # ------------------------------------------------------------------
    def _pull_loop(self, data_type: str, channel_indices: Optional[List[int]]):
        stream_name = RAW_STREAM if data_type == "raw" else PROCESSED_STREAM

        if not LSL_AVAILABLE:
            print("[RecordingService] pylsl is not installed — cannot record")
            return

        # Resolve stream
        print(f"[RecordingService] Resolving stream: {stream_name} ...")
        try:
            streams = pylsl.resolve_byprop("name", stream_name, timeout=5.0)
            if not streams:
                print(f"[RecordingService] Stream '{stream_name}' not found")
                return
            self._inlet = pylsl.StreamInlet(streams[0], max_buflen=2, recover=True)
            print(f"[RecordingService] Connected to {stream_name}")
        except Exception as e:
            print(f"[RecordingService] Stream resolution error: {e}")
            return

        # Tight pull loop at full sample rate
        while self._running and self.recorder.is_recording:
            try:
                # pull_chunk is more efficient than pull_sample in a loop
                samples, _timestamps = self._inlet.pull_chunk(timeout=0.1, max_samples=64)
                if not samples:
                    continue

                # If recorder is paused, discard the samples (keeping the LSL
                # buffer drained so it doesn't overflow when we resume).
                if self.recorder._is_paused:
                    continue

                # Extract only the channels we are recording
                if channel_indices:
                    batch = []
                    for sample in samples:
                        row = [
                            sample[idx]
                            for idx in channel_indices
                            if idx < len(sample)
                        ]
                        batch.append(row)
                else:
                    batch = [list(s) for s in samples]

                self.recorder.write_batch(batch)

            except Exception as e:
                if self._running:
                    print(f"[RecordingService] Pull error: {e}")
                time.sleep(0.01)

        # Cleanup
        self._close_inlet()
        print("[RecordingService] Pull thread stopped")

    def _close_inlet(self):
        if self._inlet:
            try:
                self._inlet.close_stream()
            except Exception:
                pass
            self._inlet = None
