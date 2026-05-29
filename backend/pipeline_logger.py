"""
NeuroTECH Pipeline Logger
═══════════════════════════════════════════════════════════════════════════
Professional-grade logging system for the NeuroTECH BCI pipeline orchestrator.

Inspired by a neuroevolution training logger (C# / SnakeGameAI), adapted for
the NeuroTECH Python orchestrator.

Outputs per session  (stored in  document/logs/<HH.MM.SS_DD-MM-YYYY>/):
  ● session_<id>.log        — full timestamped console mirror (UTF-8)
  ● blocks_<id>.csv         — per-block lifecycle events (start/stop/reload/crash)
  ● periodic_<id>.csv       — periodic snapshot metrics (every N seconds)
  ● errors_<id>.log         — error-only log with stack traces
  ● summary_<id>.txt        — human-readable session summary (written on shutdown)
"""

from __future__ import annotations

import csv
import json
import os
import platform
import sys
import threading
import time
import traceback
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import IO

# ─── Log levels ──────────────────────────────────────────────────────────────

class LogLevel(Enum):
    DEBUG    = ("●", "\033[2m",    "DEBUG  ")
    INFO     = ("ℹ", "\033[94m",   "INFO   ")
    SUCCESS  = ("+", "\033[92m",   "SUCCESS")
    WARN     = ("⚠", "\033[93m",   "WARN   ")
    ERROR    = ("✗", "\033[91m",   "ERROR  ")
    CRITICAL = ("⛔", "\033[91m\033[1m", "CRIT   ")
    SYSTEM   = ("◈", "\033[95m\033[1m", "SYSTEM ")
    PERIODIC = ("⏱", "\033[96m",   "PERIOD ")

    def __init__(self, icon: str, color: str, label: str):
        self.icon  = icon
        self.color = color
        self.label = label

RESET = "\033[0m"
BOLD  = "\033[1m"
DIM   = "\033[2m"

# ─── Data classes ────────────────────────────────────────────────────────────

@dataclass
class BlockEvent:
    """One lifecycle event for a pipeline block."""
    timestamp:  str   = ""
    block_id:   str   = ""
    block_name: str   = ""
    event:      str   = ""   # start | ready | stop | crash | reload | timeout
    exit_code:  int | None = None
    uptime_s:   float = 0.0
    reason:     str   = ""


@dataclass
class PeriodicSnapshot:
    """System-wide status snapshot taken on a timer."""
    timestamp:  str   = ""
    elapsed_s:  float = 0.0
    blocks_up:  int   = 0
    blocks_total: int = 0
    block_states: str = ""   # JSON-encoded {block_id: "up"|"down"|"disabled"}
    uptime_s:   float = 0.0


# ─── PipelineLogger ──────────────────────────────────────────────────────────

class PipelineLogger:
    """
    Thread-safe, multi-output pipeline logger.

    Usage
    -----
    logger = PipelineLogger()          # call once at startup
    logger.log("hello")                # generic info
    logger.log_block_event(...)        # block lifecycle
    logger.log_error("oops", exc)      # errors with traces
    logger.start_periodic(orchestrator, interval=30)  # background timer
    logger.finalize()                  # call on shutdown
    """

    # ------------------------------------------------------------------
    def __init__(self, *, log_root: Path | None = None, periodic_interval: float = 30.0):
        self._lock           = threading.RLock()
        self._initialized    = False
        self._session_start  = datetime.now()
        self._session_id     = self._session_start.strftime("%H.%M.%S_%d-%m-%Y")
        self._periodic_interval = periodic_interval
        self._stop_event     = threading.Event()
        self._periodic_thread: threading.Thread | None = None

        # resolved on initialize()
        project_root = Path(__file__).resolve().parent.parent
        self._log_root = log_root or (project_root / "document" / "logs")
        self._log_dir: Path | None = None

        # open file handles
        self._session_fh:  IO[str] | None = None
        self._error_fh:    IO[str] | None = None
        self._blocks_csv:  csv.DictWriter | None = None
        self._blocks_fh:   IO[str] | None = None
        self._periodic_csv:  csv.DictWriter | None = None
        self._periodic_fh:   IO[str] | None = None

        # in-memory history
        self._block_events:      list[BlockEvent]      = []
        self._periodic_snapshots: list[PeriodicSnapshot] = []
        self._block_start_times: dict[str, float]      = {}  # block_id → monotonic start

        self._initialize()

    # ------------------------------------------------------------------
    # Initialization
    # ------------------------------------------------------------------

    def _initialize(self):
        with self._lock:
            if self._initialized:
                return

            self._log_dir = self._log_root / f"pipeline_{self._session_id}"
            self._log_dir.mkdir(parents=True, exist_ok=True)

            sid = self._session_id
            self._session_fh = open(self._log_dir / f"session_{sid}.log",  "w", encoding="utf-8", buffering=1)
            self._error_fh   = open(self._log_dir / f"errors_{sid}.log",   "w", encoding="utf-8", buffering=1)

            # blocks CSV
            bf = open(self._log_dir / f"blocks_{sid}.csv", "w", newline="", encoding="utf-8")
            self._blocks_fh  = bf
            self._blocks_csv = csv.DictWriter(bf, fieldnames=[f.name for f in BlockEvent.__dataclass_fields__.values()])
            self._blocks_csv.writeheader()

            # periodic CSV
            pf = open(self._log_dir / f"periodic_{sid}.csv", "w", newline="", encoding="utf-8")
            self._periodic_fh  = pf
            self._periodic_csv = csv.DictWriter(pf, fieldnames=[f.name for f in PeriodicSnapshot.__dataclass_fields__.values()])
            self._periodic_csv.writeheader()

            self._initialized = True
            self._write_session_header()

            self.log("═══════════════════════════════════════════════════════", LogLevel.SYSTEM)
            self.log("PIPELINE LOGGER INITIALIZED", LogLevel.SYSTEM)
            self.log("═══════════════════════════════════════════════════════", LogLevel.SYSTEM)
            self.log(f"Session ID   : {self._session_id}", LogLevel.SYSTEM)
            self.log(f"Log Directory: {self._log_dir}", LogLevel.SYSTEM)
            self.log("═══════════════════════════════════════════════════════\n", LogLevel.SYSTEM)

    def _write_session_header(self):
        sep = "═" * 65
        lines = [
            f"╔{sep}╗",
            f"║   NEUROTECH BCI  — PIPELINE SESSION LOG{' ' * (len(sep) - 42)}║",
            f"╚{sep}╝",
            "",
            f"  Session Started : {self._session_start:%Y-%m-%d %H:%M:%S}",
            f"  Session ID      : {self._session_id}",
            "",
            f"  ─── SYSTEM ───",
            f"  OS              : {platform.system()} {platform.release()} ({platform.machine()})",
            f"  Python          : {sys.version.split()[0]}",
            f"  CPU Cores       : {os.cpu_count()}",
            f"  CWD             : {Path.cwd()}",
            "",
            f"╔{sep}╗",
            "",
        ]
        self._session_fh.write("\n".join(lines) + "\n")
        self._session_fh.flush()

    # ------------------------------------------------------------------
    # Core log
    # ------------------------------------------------------------------

    def log(self, message: str, level: LogLevel = LogLevel.INFO, *, to_console: bool = True):
        """Write a timestamped log entry to console + session log."""
        ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        plain   = f"[{ts}] [{level.label}] {message}"
        colored = f"{DIM}[{ts}]{RESET} {level.color}{level.icon} [{level.label}]{RESET} {message}"

        with self._lock:
            if to_console:
                print(colored)
            if self._session_fh:
                self._session_fh.write(plain + "\n")
                self._session_fh.flush()

    def log_error(self, message: str, exc: BaseException | None = None):
        """Log an error to console, session log, and the dedicated error log."""
        self.log(message, LogLevel.ERROR)
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        with self._lock:
            if self._error_fh:
                self._error_fh.write(f"\n[{ts}] {message}\n")
                if exc is not None:
                    self._error_fh.write(f"  Type    : {type(exc).__name__}\n")
                    self._error_fh.write(f"  Message : {exc}\n")
                    tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
                    self._error_fh.write(f"  Trace   :\n{tb}\n")
                self._error_fh.write("─" * 70 + "\n")
                self._error_fh.flush()

    # ------------------------------------------------------------------
    # Block lifecycle events
    # ------------------------------------------------------------------

    def log_block_event(
        self,
        block_id:   str,
        block_name: str,
        event:      str,           # "start" | "ready" | "stop" | "crash" | "reload" | "timeout"
        *,
        exit_code:  int | None = None,
        reason:     str = "",
    ):
        """Record a lifecycle event for a pipeline block."""
        ts  = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        now = time.monotonic()

        if event == "start":
            self._block_start_times[block_id] = now

        uptime = 0.0
        if block_id in self._block_start_times:
            uptime = round(now - self._block_start_times[block_id], 3)
        if event == "stop" or event == "crash":
            self._block_start_times.pop(block_id, None)

        ev = BlockEvent(
            timestamp  = ts,
            block_id   = block_id,
            block_name = block_name,
            event      = event,
            exit_code  = exit_code,
            uptime_s   = uptime,
            reason     = reason,
        )
        with self._lock:
            self._block_events.append(ev)
            if self._blocks_csv:
                self._blocks_csv.writerow(asdict(ev))
                self._blocks_fh.flush()

        # surface on console with appropriate level
        level_map = {
            "start":   LogLevel.INFO,
            "ready":   LogLevel.SUCCESS,
            "stop":    LogLevel.WARN,
            "crash":   LogLevel.ERROR,
            "reload":  LogLevel.INFO,
            "timeout": LogLevel.ERROR,
        }
        lv = level_map.get(event, LogLevel.INFO)
        parts = [f"[{block_name}] event={event}"]
        if uptime:
            parts.append(f"uptime={uptime:.1f}s")
        if exit_code is not None:
            parts.append(f"exit={exit_code}")
        if reason:
            parts.append(f"reason={reason}")
        self.log("  ".join(parts), lv)

    # ------------------------------------------------------------------
    # Periodic snapshots
    # ------------------------------------------------------------------

    def take_snapshot(self, orchestrator) -> PeriodicSnapshot:
        """Capture a periodic status snapshot from the running orchestrator."""
        now  = datetime.now()
        mono = time.monotonic()
        started: list[str]  = getattr(orchestrator, "started_blocks", [])
        runtimes: dict      = getattr(orchestrator, "runtimes", {})
        specs: dict         = getattr(orchestrator, "specs", {})

        states: dict[str, str] = {}
        up = 0
        for block_id in specs:
            spec = specs[block_id]
            if not getattr(spec, "enabled", True):
                states[block_id] = "disabled"
                continue
            if getattr(spec, "is_virtual", False):
                states[block_id] = "virtual"
                continue
            rt = runtimes.get(block_id)
            proc = getattr(rt, "process", None) if rt else None
            alive = proc is not None and proc.poll() is None
            states[block_id] = "up" if alive else "down"
            if alive:
                up += 1

        elapsed = (now - self._session_start).total_seconds()
        snap = PeriodicSnapshot(
            timestamp    = now.strftime("%Y-%m-%d %H:%M:%S"),
            elapsed_s    = round(elapsed, 1),
            blocks_up    = up,
            blocks_total = len(started),
            block_states = json.dumps(states),
            uptime_s     = round(elapsed, 1),
        )
        with self._lock:
            self._periodic_snapshots.append(snap)
            if self._periodic_csv:
                self._periodic_csv.writerow(asdict(snap))
                self._periodic_fh.flush()

        return snap

    def _log_snapshot_summary(self, snap: PeriodicSnapshot):
        sep   = "─" * 55
        lines = [
            f"\n{sep}",
            f"  ⏱  PERIODIC STATUS   {snap.timestamp}",
            f"     Elapsed  : {_format_duration(snap.elapsed_s)}",
            f"     Blocks   : {snap.blocks_up}/{snap.blocks_total} up",
        ]
        states = json.loads(snap.block_states)
        for bid, state in states.items():
            icon = "✓" if state == "up" else ("○" if state in ("disabled", "virtual") else "✗")
            lines.append(f"     {icon}  {bid:<14} {state}")
        lines.append(sep)
        self.log("\n".join(lines), LogLevel.PERIODIC)

    def start_periodic(self, orchestrator, interval: float | None = None):
        """Start a background thread that logs a status snapshot every *interval* seconds."""
        iv = interval or self._periodic_interval

        def _loop():
            while not self._stop_event.is_set():
                self._stop_event.wait(iv)
                if self._stop_event.is_set():
                    break
                try:
                    snap = self.take_snapshot(orchestrator)
                    self._log_snapshot_summary(snap)
                except Exception as exc:
                    self.log_error("Periodic snapshot failed", exc)

        self._periodic_thread = threading.Thread(target=_loop, daemon=True, name="pipeline-logger-periodic")
        self._periodic_thread.start()
        self.log(f"Periodic status logging started (every {iv:.0f}s)", LogLevel.SYSTEM)

    # ------------------------------------------------------------------
    # Session summary
    # ------------------------------------------------------------------

    def finalize(self, orchestrator=None):
        """Write session summary and flush/close all file handles."""
        with self._lock:
            if not self._initialized:
                return
            self._stop_event.set()

        summary = self._build_summary(orchestrator)
        sid = self._session_id

        # write summary
        summary_path = self._log_dir / f"summary_{sid}.txt"
        with open(summary_path, "w", encoding="utf-8") as f:
            f.write(summary)

        # also write a machine-readable session JSON
        self._write_session_json(orchestrator)

        self.log(f"\nSession summary saved → {summary_path}", LogLevel.SYSTEM)
        self.log(f"All logs stored in    → {self._log_dir}", LogLevel.SYSTEM)

        with self._lock:
            for fh in (self._session_fh, self._error_fh, self._blocks_fh, self._periodic_fh):
                try:
                    if fh:
                        fh.close()
                except Exception:
                    pass

    def _build_summary(self, orchestrator) -> str:
        total_s = (datetime.now() - self._session_start).total_seconds()
        sep = "═" * 65

        lines = [
            f"\n╔{sep}╗",
            f"║   NEUROTECH BCI — PIPELINE SESSION SUMMARY{' ' * (len(sep) - 45)}║",
            f"╚{sep}╝\n",
            f"  Session ID     : {self._session_id}",
            f"  Started        : {self._session_start:%Y-%m-%d %H:%M:%S}",
            f"  Ended          : {datetime.now():%Y-%m-%d %H:%M:%S}",
            f"  Total Duration : {_format_duration(total_s)}",
            "",
            f"  ─── BLOCK LIFECYCLE ───",
        ]

        # group events per block
        by_block: dict[str, list[BlockEvent]] = {}
        for ev in self._block_events:
            by_block.setdefault(ev.block_id, []).append(ev)

        for bid, events in sorted(by_block.items()):
            starts   = [e for e in events if e.event == "start"]
            crashes  = [e for e in events if e.event == "crash"]
            reloads  = [e for e in events if e.event == "reload"]
            last_ev  = events[-1]
            lines.append(f"    {bid:<16}  starts={len(starts)}  crashes={len(crashes)}  reloads={len(reloads)}  last={last_ev.event}")

        lines += [
            "",
            f"  ─── PERIODIC SNAPSHOTS ───",
            f"    Snapshots recorded : {len(self._periodic_snapshots)}",
        ]
        if self._periodic_snapshots:
            last_snap = self._periodic_snapshots[-1]
            lines.append(f"    Last snapshot      : {last_snap.timestamp}  blocks_up={last_snap.blocks_up}/{last_snap.blocks_total}")

        lines += [
            "",
            f"  ─── LOG FILES ───",
            f"    Directory  : {self._log_dir}",
        ]
        if self._log_dir and self._log_dir.exists():
            for p in sorted(self._log_dir.iterdir()):
                size_kb = p.stat().st_size / 1024
                lines.append(f"    {p.name:<45} {size_kb:.1f} KB")

        lines += [
            "",
            f"╔{sep}╗",
            f"║  Session closed: {datetime.now():%Y-%m-%d %H:%M:%S}{' ' * (len(sep) - 36)}║",
            f"╚{sep}╝\n",
        ]
        return "\n".join(lines)

    def _write_session_json(self, orchestrator):
        """Write a full machine-readable session JSON alongside the other files."""
        total_s = (datetime.now() - self._session_start).total_seconds()
        sid = self._session_id
        data = {
            "session_id":       sid,
            "started_at":       self._session_start.isoformat(),
            "ended_at":         datetime.now().isoformat(),
            "duration_s":       round(total_s, 1),
            "block_events":     [asdict(e) for e in self._block_events],
            "periodic_snapshots": [asdict(s) for s in self._periodic_snapshots],
        }
        json_path = self._log_dir / f"session_{sid}.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _format_duration(seconds: float) -> str:
    s = int(seconds)
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    if h:
        return f"{h}h {m:02d}m {sec:02d}s"
    if m:
        return f"{m}m {sec:02d}s"
    return f"{sec}s"
