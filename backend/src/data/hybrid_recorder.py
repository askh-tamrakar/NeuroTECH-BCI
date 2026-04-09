"""
Hybrid Recording System — Phases 1-4
=====================================
Streams raw sensor data directly to CSV at 512 Hz with separate JSON metadata.

Directory layout:
    data/<SENSOR>/recording/<SENSOR>_DD-MM-YYYY__HH-MM-SS/
        metadata.json   ← static headers + timing + integrity
        data.csv        ← header row + raw values only (no timestamps)

Time for any sample is: row_index / sampling_rate  (relative to start_time).
"""

import csv
import json
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from src.utils.paths import get_base_data_dir, get_config_dir


class HybridRecorder:
    """Thread-safe server-side recorder: metadata.json + streaming data.csv."""

    def __init__(self):
        self.base_dir: Path = get_base_data_dir()
        self.is_recording: bool = False

        # Session state (valid only while recording)
        self.session_dir: Optional[Path] = None
        self._csv_file = None
        self._csv_writer = None
        self.metadata: Optional[dict] = None
        self.row_count: int = 0
        self.sensor_type: Optional[str] = None
        self.channels: List[Dict] = []
        self.sample_rate: int = 512
        self.data_type: str = "raw"

        # Pause
        self._is_paused: bool = False
        self._pause_start: Optional[float] = None
        self._total_pause_seconds: float = 0.0

        # Flush control
        self._flush_counter: int = 0
        self._flush_interval: int = 512          # flush every ~1 s of data

        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    #  Phase 1 + 2 + 3 — start
    # ------------------------------------------------------------------
    def start(
        self,
        sensor_type: str,
        channels: List[Dict],
        sample_rate: int = 512,
        hardware_info: Optional[Dict] = None,
        filter_config: Optional[Dict] = None,
        data_type: str = "raw",
        recording_channels: Optional[List[int]] = None,
    ) -> Dict:
        with self._lock:
            if self.is_recording:
                raise RuntimeError("Recording already in progress")

            # — Phase 1: Directory & file initialisation ——————————————
            now = datetime.now()
            ts_str = now.strftime("%d-%m-%Y__%H-%M-%S")
            folder_name = f"{sensor_type}_{ts_str}"

            recording_dir = self.base_dir / sensor_type / "recording"
            self.session_dir = recording_dir / folder_name
            self.session_dir.mkdir(parents=True, exist_ok=True)

            self.sensor_type = sensor_type
            self.sample_rate = sample_rate
            self.data_type = data_type
            self.row_count = 0
            self._flush_counter = 0
            self._is_paused = False
            self._pause_start = None
            self._total_pause_seconds = 0.0

            # Filter channels to the requested subset
            if recording_channels is not None:
                self.channels = [
                    ch for ch in channels if ch.get("index") in recording_channels
                ]
            else:
                self.channels = list(channels)

            channel_meta = [
                {
                    "index": ch.get("index", 0),
                    "label": ch.get("label", f"ch{ch.get('index', 0)}"),
                    "sensor": ch.get("sensor", sensor_type),
                    "unit": ch.get("unit", "\u00b5V"),
                }
                for ch in self.channels
            ]

            # — Phase 2: Metadata configuration ———————————————————————
            self.metadata = {
                "session": {
                    "name": folder_name,
                    "sensor_type": sensor_type,
                    "data_type": data_type,
                    "created": now.isoformat(),
                },
                "acquisition": {
                    "sampling_rate": sample_rate,
                    "num_channels": len(channel_meta),
                    "channels": channel_meta,
                },
                "hardware": hardware_info or {
                    "device_id": "Arduino_UNO_R4",
                    "adc_resolution": 14,
                    "gain": 1,
                    "reference_voltage": 3.3,
                },
                "filters": filter_config or {},
                "timing": {
                    "start_time": now.isoformat(),
                    "start_timestamp_ms": int(now.timestamp() * 1000),
                    "end_time": None,
                    "end_timestamp_ms": None,
                    "duration_seconds": None,
                    "total_pause_seconds": None,
                },
                "integrity": {
                    "total_rows": 0,
                    "expected_rows": None,
                    "status": "recording",
                },
            }

            self._write_metadata()

            # — Phase 3: CSV initialisation ———————————————————————————
            csv_path = self.session_dir / "data.csv"
            self._csv_file = open(csv_path, "w", newline="", encoding="utf-8")
            self._csv_writer = csv.writer(self._csv_file)

            headers = [ch.get("label", f"ch{ch.get('index', 0)}") for ch in self.channels]
            self._csv_writer.writerow(headers)
            self._csv_file.flush()

            self.is_recording = True

            print(f"[HybridRecorder] \u25cf Recording started: {self.session_dir}")
            print(f"[HybridRecorder]   Channels: {headers}")
            print(f"[HybridRecorder]   Sample Rate: {sample_rate} Hz")
            print(f"[HybridRecorder]   Data Type: {data_type}")

            return {
                "status": "recording",
                "session": folder_name,
                "path": str(self.session_dir),
                "channels": headers,
                "sample_rate": sample_rate,
                "data_type": data_type,
            }

    # ------------------------------------------------------------------
    #  Phase 3 — high-frequency append
    # ------------------------------------------------------------------
    def write_sample(self, values: List[float]):
        """Append ONE row to the CSV.  Called at 512 Hz — must be fast."""
        if not self.is_recording or self._is_paused or self._csv_writer is None:
            return

        with self._lock:
            self._csv_writer.writerow(values)
            self.row_count += 1
            self._flush_counter += 1

            if self._flush_counter >= self._flush_interval:
                self._csv_file.flush()
                self._flush_counter = 0

    def write_batch(self, batch: List[List[float]]):
        """Append several rows at once (more efficient for pull_chunk)."""
        if not self.is_recording or self._is_paused or self._csv_writer is None:
            return

        with self._lock:
            for values in batch:
                self._csv_writer.writerow(values)
            self.row_count += len(batch)
            self._flush_counter += len(batch)

            if self._flush_counter >= self._flush_interval:
                self._csv_file.flush()
                self._flush_counter = 0

    # ------------------------------------------------------------------
    #  Pause / Resume
    # ------------------------------------------------------------------
    def pause(self) -> Dict:
        with self._lock:
            if self.is_recording and not self._is_paused:
                self._is_paused = True
                self._pause_start = time.time()
                print("[HybridRecorder] \u23f8 Recording paused")
                return {"status": "paused"}
            return {"status": "unchanged"}

    def resume(self) -> Dict:
        with self._lock:
            if self.is_recording and self._is_paused:
                if self._pause_start is not None:
                    self._total_pause_seconds += time.time() - self._pause_start
                self._is_paused = False
                self._pause_start = None
                print("[HybridRecorder] \u25b6 Recording resumed")
                return {"status": "resumed"}
            return {"status": "unchanged"}

    # ------------------------------------------------------------------
    #  Phase 4 — session finalization
    # ------------------------------------------------------------------
    def stop(self) -> Dict:
        with self._lock:
            if not self.is_recording:
                return {"status": "not_recording"}

            self.is_recording = False

            # If paused, account for final pause segment
            if self._is_paused and self._pause_start is not None:
                self._total_pause_seconds += time.time() - self._pause_start
                self._is_paused = False
                self._pause_start = None

            # Close CSV
            if self._csv_file:
                self._csv_file.flush()
                self._csv_file.close()
                self._csv_file = None
                self._csv_writer = None

            # Compute timing
            now = datetime.now()
            start_ms = self.metadata["timing"]["start_timestamp_ms"]
            end_ms = int(now.timestamp() * 1000)
            wall_duration = (end_ms - start_ms) / 1000.0
            effective_duration = wall_duration - self._total_pause_seconds
            expected_rows = int(self.sample_rate * effective_duration)

            # Integrity check (±0.5 s tolerance)
            tolerance = self.sample_rate * 0.5
            integrity_ok = abs(self.row_count - expected_rows) <= tolerance

            # Update metadata
            self.metadata["timing"]["end_time"] = now.isoformat()
            self.metadata["timing"]["end_timestamp_ms"] = end_ms
            self.metadata["timing"]["duration_seconds"] = round(effective_duration, 3)
            self.metadata["timing"]["total_pause_seconds"] = round(self._total_pause_seconds, 3)
            self.metadata["integrity"]["total_rows"] = self.row_count
            self.metadata["integrity"]["expected_rows"] = expected_rows
            self.metadata["integrity"]["status"] = "valid" if integrity_ok else "warning_row_mismatch"

            if not integrity_ok:
                self.metadata["integrity"]["note"] = (
                    f"Row count ({self.row_count}) differs from expected "
                    f"({expected_rows}) by {abs(self.row_count - expected_rows)} samples"
                )

            self._write_metadata()

            result = {
                "status": "stopped",
                "session": self.metadata["session"]["name"],
                "path": str(self.session_dir),
                "duration_seconds": round(effective_duration, 3),
                "total_rows": self.row_count,
                "expected_rows": expected_rows,
                "integrity": "valid" if integrity_ok else "warning",
                "data_type": self.data_type,
            }

            print(f"[HybridRecorder] \u25a0 Recording stopped: {self.session_dir}")
            print(f"[HybridRecorder]   Duration: {effective_duration:.1f}s (paused {self._total_pause_seconds:.1f}s)")
            print(f"[HybridRecorder]   Rows: {self.row_count} (expected: {expected_rows})")
            integrity_label = "\u2705 Valid" if integrity_ok else "\u26a0\ufe0f Mismatch"
            print(f"[HybridRecorder]   Integrity: {integrity_label}")

            # Reset session state
            session_dir = self.session_dir
            self.session_dir = None
            self.metadata = None
            self.channels = []

            return result

    # ------------------------------------------------------------------
    #  Status / List / Delete
    # ------------------------------------------------------------------
    def get_status(self) -> Dict:
        with self._lock:
            if self.is_recording and self.metadata:
                start_ms = self.metadata["timing"]["start_timestamp_ms"]
                elapsed = (time.time() * 1000 - start_ms) / 1000.0
                effective = elapsed - self._total_pause_seconds
                if self._is_paused and self._pause_start:
                    effective -= (time.time() - self._pause_start)
                return {
                    "is_recording": True,
                    "is_paused": self._is_paused,
                    "session": self.metadata["session"]["name"],
                    "sensor_type": self.sensor_type,
                    "data_type": self.data_type,
                    "elapsed_seconds": round(effective, 1),
                    "rows_written": self.row_count,
                    "path": str(self.session_dir),
                }
            return {"is_recording": False, "is_paused": False}

    def list_recordings(self) -> List[Dict]:
        """Scan data/<sensor>/recording/ for all completed sessions."""
        recordings = []
        if not self.base_dir.exists():
            return recordings

        for sensor_dir in self.base_dir.iterdir():
            if not sensor_dir.is_dir():
                continue
            rec_dir = sensor_dir / "recording"
            if not rec_dir.exists():
                continue
            for session_dir in rec_dir.iterdir():
                if not session_dir.is_dir():
                    continue
                meta_path = session_dir / "metadata.json"
                if not meta_path.exists():
                    continue
                try:
                    with open(meta_path, "r", encoding="utf-8") as f:
                        meta = json.load(f)
                    recordings.append({
                        "session": meta["session"]["name"],
                        "sensor_type": meta["session"]["sensor_type"],
                        "data_type": meta["session"].get("data_type", "unknown"),
                        "duration_seconds": meta["timing"].get("duration_seconds"),
                        "total_rows": meta["integrity"].get("total_rows", 0),
                        "created": meta["session"]["created"],
                        "path": str(session_dir),
                        "integrity": meta["integrity"].get("status", "unknown"),
                    })
                except Exception:
                    pass

        recordings.sort(key=lambda x: x.get("created", ""), reverse=True)
        return recordings

    def delete_session(self, session_path: str) -> bool:
        """Remove a recording session folder from disk."""
        import shutil
        p = Path(session_path)
        # Safety: only delete inside our base data dir
        try:
            p.resolve().relative_to(self.base_dir.resolve())
        except ValueError:
            return False
        if p.exists() and p.is_dir():
            shutil.rmtree(p)
            return True
        return False

    # ------------------------------------------------------------------
    #  Internal helpers
    # ------------------------------------------------------------------
    def _write_metadata(self):
        if self.session_dir and self.metadata:
            meta_path = self.session_dir / "metadata.json"
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(self.metadata, f, indent=2, ensure_ascii=False)
