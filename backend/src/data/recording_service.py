"""
Recording Service — dedicated LSL pull thread for server-side recording.

Pulls samples directly from an LSL stream (BioSignals-Raw-uV or
BioSignals-Processed) and writes them to one or more HybridRecorder instances.

Multi-recorder support (Case 2 — split-sensor recording):
    Pass recorder_groups = [(recorder_a, [ch0_idx]), (recorder_b, [ch1_idx])]
    to start().  Each group routes its channel slice to the appropriate recorder.

IMPORTANT: pylsl calls (resolve_byprop, pull_chunk) are blocking C-extension
calls that cannot yield to the eventlet hub.  The pull thread MUST run in a
real OS thread — never an eventlet greenlet — or the entire server freezes.
We use eventlet.patcher.original('threading') to bypass monkey-patching.
"""

import time
from typing import List, Optional, Tuple

try:
    import pylsl
    LSL_AVAILABLE = True
except Exception:
    pylsl = None
    LSL_AVAILABLE = False

RAW_STREAM = "BioSignals-Raw-uV"
PROCESSED_STREAM = "BioSignals-Processed"


class RecordingService:
    """Background thread that pulls from an LSL stream into HybridRecorder(s)."""

    def __init__(self, recorder=None):
        self.recorder = recorder          # primary recorder (may be None)
        self._thread = None
        self._running = False
        self._inlet = None

    # ------------------------------------------------------------------
    #  Public API
    # ------------------------------------------------------------------
    def start(
        self,
        data_type: str = "raw",
        channel_indices: Optional[List[int]] = None,
        recorder_groups: Optional[List[Tuple]] = None,
    ):
        """Spin up the pull thread.  Call *after* all recorders have started.

        Parameters
        ----------
        data_type       : "raw" or "filtered"
        channel_indices : (single-recorder mode) indices of channels to record
        recorder_groups : (multi-recorder mode) list of (HybridRecorder, [indices])
                          tuples.  When provided, channel_indices is ignored.

        Uses the *original* (non-monkey-patched) threading.Thread so the
        blocking pylsl C calls run in a real OS thread and never freeze the
        eventlet hub.
        """
        if self._thread and self._thread.is_alive():
            return

        # Build groups list from whichever form was provided
        if recorder_groups is not None:
            groups = list(recorder_groups)
        else:
            groups = [(self.recorder, channel_indices)]

        self._running = True

        try:
            import eventlet.patcher as _ep
            _real_Thread = _ep.original("threading").Thread
        except Exception:
            import threading as _t
            _real_Thread = _t.Thread

        self._thread = _real_Thread(
            target=self._pull_loop,
            args=(data_type, groups),
            daemon=True,
        )
        self._thread.start()

    def stop(self):
        """Signal the pull thread to exit and wait for it."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=2.0)
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
    def _pull_loop(self, data_type: str, groups: List[Tuple]):
        """Pull chunks from LSL and route each sample subset to its recorder.

        groups: list of (HybridRecorder, channel_indices_or_None)
        """
        stream_name = RAW_STREAM if data_type == "raw" else PROCESSED_STREAM

        if not LSL_AVAILABLE:
            print("[RecordingService] pylsl is not installed — cannot record")
            return

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

        # Read the stream's actual sample rate and propagate it to every recorder
        # before any data is written.  The config value (e.g. 512 Hz) is often
        # wrong when the pipeline runs at a different rate; using the inlet's
        # nominal_srate fixes the timestamp column and the integrity expected_rows.
        try:
            actual_sr = int(round(self._inlet.info().nominal_srate()))
            if actual_sr > 0:
                for recorder, _ in groups:
                    recorder.sample_rate = actual_sr
                print(f"[RecordingService] Stream sample rate: {actual_sr} Hz")
        except Exception:
            pass

        while self._running and any(rec.is_recording for rec, _ in groups):
            try:
                samples, _timestamps = self._inlet.pull_chunk(timeout=0.1, max_samples=512)
                if not samples:
                    continue

                for recorder, indices in groups:
                    if not recorder.is_recording or recorder._is_paused:
                        # Keep LSL buffer drained but do not write
                        continue

                    if indices:
                        batch = [
                            [sample[idx] for idx in indices if idx < len(sample)]
                            for sample in samples
                        ]
                    else:
                        batch = [list(s) for s in samples]

                    recorder.write_batch(batch)

            except Exception as e:
                if self._running:
                    print(f"[RecordingService] Pull error: {e}")
                time.sleep(0.01)

        self._close_inlet()
        print("[RecordingService] Pull thread stopped")

    def _close_inlet(self):
        if self._inlet:
            try:
                self._inlet.close_stream()
            except Exception:
                pass
            self._inlet = None
