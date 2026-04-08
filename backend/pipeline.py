import argparse
import os
import shlex
import signal
import socket
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable


try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


STDOUT_LOCK = threading.RLock()
PROMPT_ACTIVE = False


def get_local_ips():
    """Returns a list of all non-loopback IPv4 addresses."""
    ips = []
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith("127."):
                ips.append(ip)
    except Exception:
        pass

    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0)
        s.connect(("8.8.8.8", 1))
        ip = s.getsockname()[0]
        if ip not in ips:
            ips.append(ip)
        s.close()
    except Exception:
        pass
    return list(set(ips))


def choose_preferred_ip(ips):
    def score(ip):
        if not ip or ip.startswith("127."):
            return -100
        if ip.startswith("169.254."):
            return -50
        if ip.startswith("172.30."):
            return 5
        if ip.startswith("10.") or ip.startswith("192.168.") or ip.startswith("172.16."):
            return 100
        if ip.startswith("172."):
            return 80
        return 60

    candidates = [ip for ip in ips if ip and not ip.startswith("127.")]
    if not candidates:
        return "127.0.0.1"
    return sorted(candidates, key=score, reverse=True)[0]


class Theme:
    HEADER = "\033[95m"
    OKBLUE = "\033[94m"
    OKCYAN = "\033[96m"
    OKGREEN = "\033[92m"
    WARNING = "\033[93m"
    FAIL = "\033[91m"
    BOLD = "\033[1m"
    UNDERLINE = "\033[4m"
    DIM = "\033[2m"
    RESET = "\033[0m"

    SYS = f"{BOLD}{OKCYAN}!{RESET}"
    SUCCESS = f"{BOLD}{OKGREEN}+{RESET}"
    ERROR = f"{BOLD}{FAIL}x{RESET}"
    INFO = f"{BOLD}{OKBLUE}i{RESET}"
    WARN = f"{BOLD}{WARNING}!{RESET}"
    BUILD = f"{BOLD}{HEADER}#{RESET}"
    LAUNCH = f"{BOLD}{OKCYAN}>{RESET}"


def get_timestamp():
    return f"{Theme.DIM}[{time.strftime('%H:%M:%S')}] {Theme.RESET}"


def log_system(msg, icon=Theme.SYS):
    icon_prefix = f"{icon}".center(17)
    with STDOUT_LOCK:
        if PROMPT_ACTIVE:
            sys.stdout.write("\r")
        print(f"{get_timestamp()}{icon_prefix}{Theme.BOLD}{msg}{Theme.RESET}")
        if PROMPT_ACTIVE:
            sys.stdout.write(runtime_prompt())
            sys.stdout.flush()


def runtime_prompt() -> str:
    return "NeuroTECH Loded >>> "


ALLOWLIST = [
    "[event]",
    "[config]",
    "[model]",
    "[session]",
    "[rec]",
    "error",
    "exception",
    "[ok]",
    "[fail]",
    "http",
    "local",
    "network",
    "dev server",
]

SYMBOLS = ["+", "x", "!", "http://", "ws://"]


@dataclass(frozen=True)
class WatchEntry:
    block_id: str
    path: Path

    @property
    def specificity(self) -> tuple[int, int]:
        return (1 if self.path.is_file() else 0, len(self.path.parts))


@dataclass
class BlockSpec:
    block_id: str
    name: str
    color: str
    module: str | None = None
    command_builder: Callable[[], list[str]] | None = None
    cwd: Path | None = None
    shell: bool = False
    ready_pattern: str | None = None
    success_msg: str | None = None
    dependencies: tuple[str, ...] = ()
    aliases: tuple[str, ...] = ()
    watch_entries: tuple[WatchEntry, ...] = ()
    reload_targets: tuple[str, ...] = ()
    enabled: bool = True

    @property
    def is_virtual(self) -> bool:
        return self.module is None and self.command_builder is None


@dataclass
class BlockRuntime:
    spec: BlockSpec
    process: subprocess.Popen | None = None
    ready_event: threading.Event = field(default_factory=threading.Event)
    thread: threading.Thread | None = None
    intentional_restart: bool = False
    running: bool = False


def create_parser():
    parser = argparse.ArgumentParser(
        description="NeuroTECH Pipeline Orchestrator",
        formatter_class=argparse.RawTextHelpFormatter,
        epilog=(
            "Blocks:\n"
            "  stream, filter, feature, server, actuator, hid, servo, frontend,\n"
            "  neurobench, lab, ssvep\n"
            "\n"
            "Examples:\n"
            "  python pipeline.py\n"
            "  python pipeline.py -n\n"
            "  python pipeline.py --blocks stream,filter,feature,server\n"
            "  python pipeline.py -d --blocks frontend,server\n"
            "\n"
            "Runtime commands after startup:\n"
            "  blocks       List all blocks and aliases\n"
            "  status       Show running block status\n"
            "  watch        Watch all registered block files and reload changed blocks only\n"
            "  watch off    Stop global watch mode\n"
            "  rl <block>   Reload only the selected block or alias\n"
            "  exit         Shut down the full pipeline cleanly\n"
        ),
    )
    parser.add_argument("-b", "--build", action="store_true", help="Build frontend and start on port 5005")
    parser.add_argument("-d", "--dev", action="store_true", help="Start React dev server")
    parser.add_argument("-r", "--remote", action="store_true", help="Serve remotely (no local frontend)")
    parser.add_argument("-v", "--verbose", action="store_true", help="Detailed console logs")
    parser.add_argument("-n", "--neurobench", action="store_true", help="Start NeuroBench simulator")
    parser.add_argument(
        "--blocks",
        action="append",
        default=[],
        help="Comma-separated list of blocks to start (example: --blocks stream,filter,server)",
    )
    return parser


def parse_block_selection(raw_values: list[str]) -> list[str]:
    blocks = []
    for raw in raw_values:
        for item in str(raw).split(","):
            item = item.strip().lower()
            if item:
                blocks.append(item)
    return blocks


def build_python_cmd(python_exe: str, module: str) -> list[str]:
    if getattr(sys, "frozen", False):
        return [sys.executable, "-m", module]
    return [python_exe, "-u", "-m", module]


def module_block(
    *,
    block_id: str,
    name: str,
    module: str,
    color: str,
    python_exe: str,
    cwd: Path,
    ready_pattern: str | None = None,
    success_msg: str | None = None,
    dependencies: tuple[str, ...] = (),
    aliases: tuple[str, ...] = (),
    watch_entries: tuple[WatchEntry, ...] = (),
    reload_targets: tuple[str, ...] = (),
    enabled: bool = True,
) -> BlockSpec:
    return BlockSpec(
        block_id=block_id,
        name=name,
        module=module,
        color=color,
        cwd=cwd,
        ready_pattern=ready_pattern,
        success_msg=success_msg,
        dependencies=dependencies,
        aliases=aliases,
        watch_entries=watch_entries,
        reload_targets=reload_targets,
        enabled=enabled,
        command_builder=lambda: build_python_cmd(python_exe, module),
    )


def path_entries(block_id: str, project_root: Path, *relative_paths: str) -> tuple[WatchEntry, ...]:
    return tuple(WatchEntry(block_id, project_root / relative_path) for relative_path in relative_paths)


def build_block_specs(args, project_root: Path, backend_dir: Path, frontend_dir: Path, python_exe: str):
    frontend_enabled = bool(args.dev and not args.remote)
    specs = {
        "stream": module_block(
            block_id="stream",
            name="Stream Manager",
            module="src.acquisition.stream_manager",
            color=Theme.HEADER,
            python_exe=python_exe,
            cwd=backend_dir,
            ready_pattern="Created stream 'BioSignals-Events'",
            success_msg="LSL Stream Manager started and connected",
            aliases=("stream", "stream-manager"),
            watch_entries=path_entries(
                "stream",
                project_root,
                "backend/src/acquisition/stream_manager.py",
                "backend/src/acquisition/lsl_streams.py",
            ),
        ),
        "filter": module_block(
            block_id="filter",
            name="Filter Router",
            module="src.processing.filter_router",
            color=Theme.OKBLUE,
            python_exe=python_exe,
            cwd=backend_dir,
            ready_pattern="Pipeline configured successfully",
            success_msg="Filter Router connected to raw stream",
            dependencies=("stream",),
            aliases=("filter", "filters", "filter-router"),
            watch_entries=path_entries("filter", project_root, "backend/src/processing"),
        ),
        "feature": module_block(
            block_id="feature",
            name="Feature Router",
            module="src.feature.router",
            color=Theme.OKGREEN,
            python_exe=python_exe,
            cwd=backend_dir,
            ready_pattern="Connected to BioSignals-Processed",
            success_msg="Feature Router connected and processing",
            dependencies=("filter",),
            aliases=("feature", "features", "feature-router"),
            watch_entries=path_entries("feature", project_root, "backend/src/feature"),
        ),
        "hid": module_block(
            block_id="hid",
            name="HID Controller",
            module="src.actuation.hid_controller",
            color=Theme.DIM,
            python_exe=python_exe,
            cwd=backend_dir,
            ready_pattern="Connected to Event Stream",
            success_msg="HID Controller connected and ready",
            dependencies=("feature",),
            aliases=("hid",),
            watch_entries=path_entries("actuator", project_root, "backend/src/actuation"),
        ),
        "servo": module_block(
            block_id="servo",
            name="Servo Actuator",
            module="src.actuation.servo_controller",
            color=Theme.FAIL,
            python_exe=python_exe,
            cwd=backend_dir,
            ready_pattern="Connected to StreamManager Relay via TCP.",
            success_msg="Servo Actuator connected to Relay",
            dependencies=("stream", "feature"),
            aliases=("servo",),
            watch_entries=path_entries("actuator", project_root, "backend/src/actuation"),
        ),
        "server": module_block(
            block_id="server",
            name="Web Server",
            module="src.server.web_server",
            color=Theme.WARNING,
            python_exe=python_exe,
            cwd=backend_dir,
            success_msg="Web Config Server started",
            aliases=("server", "web", "web-server"),
            watch_entries=path_entries(
                "server",
                project_root,
                "backend/src/server/web_server.py",
                "backend/src/server/server",
            ),
        ),
        "neurobench": module_block(
            block_id="neurobench",
            name="NeuroBench",
            module="src.utils.neurobench",
            color=Theme.OKCYAN,
            python_exe=python_exe,
            cwd=backend_dir,
            aliases=("neurobench", "bench"),
            watch_entries=path_entries("neurobench", project_root, "backend/src/utils/neurobench.py"),
            enabled=bool(args.neurobench),
        ),
        "lab": BlockSpec(
            block_id="lab",
            name="Lab Backend",
            color=Theme.OKBLUE,
            aliases=("lab", "ml"),
            watch_entries=path_entries(
                "lab",
                project_root,
                "backend/src/learning",
                "backend/src/database",
                "backend/src/calibration",
                "backend/src/server/server/routes/training_routes.py",
                "backend/src/server/server/routes/session_routes.py",
                "backend/src/server/server/routes/recording_routes.py",
                "backend/src/server/server/services/training_job_service.py",
                "backend/src/server/server/services/file_service.py",
                "backend/src/server/server/services/config_service.py",
            ),
            reload_targets=("server",),
        ),
        "ssvep": BlockSpec(
            block_id="ssvep",
            name="SSVEP Backend",
            color=Theme.OKGREEN,
            aliases=("ssvep", "eeg"),
            watch_entries=path_entries(
                "ssvep",
                project_root,
                "backend/src/core/fbcca.py",
                "backend/src/core/mode_manager.py",
                "backend/src/feature/ssvep_utils.py",
                "backend/src/feature/extractors/trigger_extractor.py",
                "backend/src/feature/detectors/eeg_frequency_detector.py",
                "backend/src/modules/focus_monitor.py",
                "backend/src/modules/meditation_trainer.py",
                "backend/src/modules/music_control.py",
                "backend/src/modules/stress_monitor.py",
                "backend/src/modules/bubble_game.py",
                "backend/src/modules/frontal_detectors.py",
                "backend/src/server/server/lsl_service.py",
            ),
            reload_targets=("feature", "server"),
        ),
    }

    if frontend_enabled:
        specs["frontend"] = BlockSpec(
            block_id="frontend",
            name="Frontend Dev",
            color=Theme.OKCYAN,
            cwd=frontend_dir,
            shell=True,
            aliases=("frontend", "ui"),
            command_builder=lambda: ["npm", "run", "dev"],
            success_msg="Frontend Dev Server started",
            watch_entries=path_entries(
                "frontend",
                project_root,
                "frontend/src",
                "frontend/vite.config.js",
                "frontend/index.html",
            ),
        )
    else:
        specs["frontend"] = BlockSpec(
            block_id="frontend",
            name="Frontend",
            color=Theme.OKCYAN,
            aliases=("frontend", "ui"),
            enabled=False,
            watch_entries=path_entries(
                "frontend",
                project_root,
                "frontend/src",
                "frontend/vite.config.js",
                "frontend/index.html",
            ),
        )
    return specs


def build_alias_map(specs: dict[str, BlockSpec]) -> dict[str, tuple[str, ...]]:
    alias_map = {"actuator": ("hid", "servo")}
    for spec in specs.values():
        alias_map.setdefault(spec.block_id, (spec.block_id,))
        for alias in spec.aliases:
            alias_map[alias] = (spec.block_id,)
    return alias_map


def resolve_requested_blocks(requested: list[str], alias_map: dict[str, tuple[str, ...]], specs: dict[str, BlockSpec]) -> list[str]:
    if not requested:
        default_blocks = ["stream", "filter", "feature", "hid", "servo", "server"]
        if specs.get("frontend") and specs["frontend"].enabled:
            default_blocks.append("frontend")
        if specs.get("neurobench") and specs["neurobench"].enabled:
            default_blocks.append("neurobench")
        return default_blocks

    resolved = []
    for token in requested:
        for block_id in alias_map.get(token.lower(), (token.lower(),)):
            if block_id not in specs:
                raise ValueError(f"Unknown block '{token}'")
            if block_id not in resolved:
                resolved.append(block_id)

    if specs.get("neurobench") and specs["neurobench"].enabled and "neurobench" not in resolved:
        resolved.append("neurobench")
    return resolved


def expand_startup_blocks(selected: list[str], specs: dict[str, BlockSpec]) -> list[str]:
    expanded = []
    for block_id in selected:
        spec = specs[block_id]
        targets = spec.reload_targets if spec.is_virtual else ()
        members = targets or (block_id,)
        for member in members:
            if member in specs and specs[member].enabled and member not in expanded:
                expanded.append(member)
    return expanded


def dependency_order(block_ids: list[str], specs: dict[str, BlockSpec]) -> list[str]:
    ordered = []
    seen = set()

    def visit(block_id: str):
        if block_id in seen:
            return
        seen.add(block_id)
        for dep in specs[block_id].dependencies:
            if dep in block_ids:
                visit(dep)
        if block_id not in ordered:
            ordered.append(block_id)

    for block_id in block_ids:
        visit(block_id)
    return ordered


def split_runtime_process_ids(changed_blocks: list[str], specs: dict[str, BlockSpec]) -> list[str]:
    process_ids = []
    for block_id in changed_blocks:
        spec = specs[block_id]
        targets = spec.reload_targets if spec.is_virtual else (block_id,)
        for target in targets:
            if target not in process_ids and specs[target].enabled:
                process_ids.append(target)
    return process_ids


def list_owned_files(entries: tuple[WatchEntry, ...]) -> list[Path]:
    files = []
    seen = set()
    for entry in entries:
        path = entry.path
        if path.is_file():
            if path not in seen:
                files.append(path)
                seen.add(path)
            continue
        if path.is_dir():
            for file_path in path.rglob("*"):
                if file_path.is_file() and file_path not in seen:
                    files.append(file_path)
                    seen.add(file_path)
    return files


def resolve_path_owner(path: Path, specs: dict[str, BlockSpec]) -> str | None:
    best: tuple[int, int] | None = None
    winner = None
    for spec in specs.values():
        for entry in spec.watch_entries:
            candidate = entry.path
            matched = False
            if candidate.is_file():
                matched = path == candidate
            elif candidate.is_dir():
                try:
                    path.relative_to(candidate)
                    matched = True
                except ValueError:
                    matched = False
            if matched and (best is None or entry.specificity > best):
                best = entry.specificity
                winner = entry.block_id
    return winner


def log_process(runtime: BlockRuntime, verbose: bool):
    spec = runtime.spec
    prefix = f"{spec.color}{Theme.BOLD}[{spec.name:^15}]{Theme.RESET}"

    process = runtime.process
    if process is None or process.stdout is None:
        return

    for line in iter(process.stdout.readline, b""):
        try:
            msg = line.decode("utf-8", errors="replace").strip()
            if not msg:
                continue

            msg_lower = msg.lower()
            is_important = any(pattern in msg_lower for pattern in ALLOWLIST) or any(sym in msg for sym in SYMBOLS)
            if verbose or is_important:
                with STDOUT_LOCK:
                    if PROMPT_ACTIVE:
                        sys.stdout.write("\r")
                    print(f"{get_timestamp()}{prefix} {msg}")
                    if PROMPT_ACTIVE:
                        sys.stdout.write(runtime_prompt())
                        sys.stdout.flush()

            if spec.ready_pattern and not runtime.ready_event.is_set() and spec.ready_pattern in msg:
                ready_msg = spec.success_msg if spec.success_msg else f"{spec.name} is READY"
                log_system(ready_msg, icon=Theme.SUCCESS)
                runtime.ready_event.set()
        except Exception:
            pass


class PipelineOrchestrator:
    def __init__(self, args):
        self.args = args
        self.project_root = Path(__file__).resolve().parent.parent
        self.backend_dir = Path(__file__).resolve().parent
        self.frontend_dir = self.project_root / "frontend"
        self.python_exe = sys.executable

        self.specs = build_block_specs(args, self.project_root, self.backend_dir, self.frontend_dir, self.python_exe)
        self.alias_map = build_alias_map(self.specs)
        self.runtimes = {block_id: BlockRuntime(spec) for block_id, spec in self.specs.items()}
        self.watch_enabled = False
        self.stop_event = threading.Event()
        self.pending_reload = set()
        self.watch_snapshot: dict[Path, float] = {}
        self.started_blocks: list[str] = []

    def print_banner(self):
        banner = r"""

     ███╗   ██╗ ███████╗ ██╗   ██╗ ██████╗   ██████╗  ████████╗ ███████╗  ██████╗ ██╗  ██╗
     ████╗  ██║ ██╔════╝ ██║   ██║ ██╔══██╗ ██╔═══██╗ ╚══██╔══╝ ██╔════╝ ██╔════╝ ██║  ██║
     ██╔██╗ ██║ █████╗   ██║   ██║ ██████╔╝ ██║   ██║    ██║    █████╗   ██║      ███████║
     ██║╚██╗██║ ██╔══╝   ██║   ██║ ██╔══██╗ ██║   ██║    ██║    ██╔══╝   ██║      ██╔══██║
     ██║ ╚████║ ███████╗ ╚██████╔╝ ██║  ██║ ╚██████╔╝    ██║    ███████╗ ╚██████╗ ██║  ██║
     ╚═╝  ╚═══╝ ╚══════╝  ╚═════╝  ╚═╝  ╚═╝  ╚═════╝     ╚═╝    ╚══════╝  ╚═════╝ ╚═╝  ╚═╝
        """
        print(f"\n{Theme.HEADER}{Theme.BOLD}")
        print("=" * 88)
        print(banner.strip("\n"))
        print("             SYSTEM ORCHESTRATOR v0.2.0")
        print("=" * 88 + f"{Theme.RESET}")
        print(f"  {Theme.DIM}Mode: {'Development' if self.args.dev else 'Production'}")
        if self.args.remote:
            print(f"  {Theme.BOLD}{Theme.WARNING}► REMOTE MODE ACTIVE: Local frontend suppressed.{Theme.RESET}")

        ips = get_local_ips()
        preferred_ip = choose_preferred_ip(ips)
        port = 5005
        print(f"  {Theme.BOLD}{Theme.OKGREEN}► Backend Connectivity Options:{Theme.RESET}")
        print(f"      - Dashboard/API: http://{preferred_ip}:{port}")
        print(f"        WebSocket: ws://{preferred_ip}:{port}")
        print(f"        Raw ingress: {preferred_ip}:6000")
        print(f"        Relay/actuation: {preferred_ip}:6002")
        print(
            f"  {Theme.BOLD}{Theme.OKCYAN}► NeuroTECH Pipeline Load >>> "
            f"{Theme.OKGREEN}blocks{Theme.RESET}{Theme.DIM} | "
            f"{Theme.OKCYAN}status{Theme.RESET}{Theme.DIM} | "
            f"{Theme.WARNING}watch{Theme.RESET}{Theme.DIM} | "
            f"{Theme.FAIL}rl <block>{Theme.RESET}"
        )
        print()

    def prepare_frontend(self):
        if (self.args.build or self.args.dev) and not (self.frontend_dir / "node_modules").exists():
            log_system("Installing frontend dependencies...", icon=Theme.BUILD)
            try:
                subprocess.run(["npm", "install"], cwd=self.frontend_dir, shell=True, check=True)
            except Exception as exc:
                log_system(f"Dependency installation failed: {exc}", icon=Theme.ERROR)

        if self.args.build:
            log_system("Building frontend...", icon=Theme.BUILD)
            try:
                log_system("Running npm run build...")
                subprocess.run(["npm", "run", "build"], cwd=self.frontend_dir, shell=True, check=True)
                log_system("Frontend built successfully!", icon=Theme.SUCCESS)
            except Exception as exc:
                log_system(f"Frontend build FAILED: {exc}", icon=Theme.ERROR)
                log_system("Continuing anyway...", icon=Theme.WARN)
        elif self.args.dev:
            log_system("Skipping build (Dev Mode active)...", icon=Theme.INFO)
        else:
            log_system("Using existing 'dist' for frontend...", icon=Theme.INFO)

        log_system(f"Using Python Interpreter: {Theme.DIM}{self.python_exe}{Theme.RESET}", icon=Theme.INFO)

    def install_signal_handlers(self):
        signal.signal(signal.SIGINT, self.shutdown_handler)
        signal.signal(signal.SIGTERM, self.shutdown_handler)

    def startup(self):
        raw_requested = parse_block_selection(self.args.blocks)
        selected = resolve_requested_blocks(raw_requested, self.alias_map, self.specs)
        self.started_blocks = dependency_order(expand_startup_blocks(selected, self.specs), self.specs)

        for block_id in self.started_blocks:
            self.start_block(block_id)

        print()
        log_system("All requested components running. Type 'blocks', 'status', 'watch', or 'rl <block>'.", icon=Theme.SUCCESS)
        print()

    def start_block(self, block_id: str):
        runtime = self.runtimes[block_id]
        spec = runtime.spec
        if not spec.enabled or spec.is_virtual:
            return

        if runtime.running and runtime.process and runtime.process.poll() is None:
            return

        log_system(f"Launching {spec.name}...", icon=Theme.LAUNCH)
        runtime.ready_event = threading.Event()
        runtime.intentional_restart = False
        cmd = spec.command_builder() if spec.command_builder else []
        launch_cmd = subprocess.list2cmdline(cmd) if spec.shell else cmd
        process = subprocess.Popen(
            launch_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            cwd=str(spec.cwd or self.backend_dir),
            env=os.environ.copy(),
            shell=spec.shell,
        )
        process.name = spec.name
        runtime.process = process
        runtime.running = True

        thread = threading.Thread(target=log_process, args=(runtime, self.args.verbose), daemon=True)
        runtime.thread = thread
        thread.start()

        if spec.ready_pattern:
            log_system(f"Waiting for {spec.name} to initialize...", icon=Theme.SYS)
            if not runtime.ready_event.wait(timeout=60.0):
                log_system(f"ERROR: {spec.name} timed out while connecting!", icon=Theme.ERROR)
                self.shutdown()
                return
            time.sleep(0.3)

    def stop_block(self, block_id: str, timeout: float = 5.0):
        runtime = self.runtimes[block_id]
        process = runtime.process
        if process is None or process.poll() is not None:
            runtime.running = False
            return

        runtime.intentional_restart = True
        log_system(f"Terminating {runtime.spec.name}...", icon=Theme.WARN)
        process.terminate()
        try:
            process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            log_system(f"Force killing {runtime.spec.name}...", icon=Theme.WARN)
            process.kill()
            process.wait(timeout=timeout)
        finally:
            runtime.running = False

    def reload_blocks(self, block_ids: list[str], reason: str):
        if not block_ids:
            return

        actual_processes = split_runtime_process_ids(block_ids, self.specs)
        actual_processes = [block_id for block_id in actual_processes if block_id in self.started_blocks]
        if not actual_processes:
            log_system(f"No running process maps to {', '.join(block_ids)}.", icon=Theme.INFO)
            return

        ordered = dependency_order(actual_processes, self.specs)
        pretty = ", ".join(block_ids)
        if reason == "manual":
            log_system(f"Reload request accepted for: {pretty}", icon=Theme.INFO)
        log_system(f"Reloading {pretty} ({reason})...", icon=Theme.INFO)

        for block_id in reversed(ordered):
            self.stop_block(block_id)
        for block_id in ordered:
            self.start_block(block_id)

    def refresh_watch_snapshot(self):
        snapshot = {}
        for path in self.iter_watch_files():
            try:
                snapshot[path] = path.stat().st_mtime
            except OSError:
                continue
        self.watch_snapshot = snapshot

    def iter_watch_files(self):
        all_entries = []
        for spec in self.specs.values():
            all_entries.extend(spec.watch_entries)
        seen = set()
        for file_path in list_owned_files(tuple(all_entries)):
            if file_path not in seen:
                seen.add(file_path)
                yield file_path

    def detect_changed_blocks(self) -> list[str]:
        changed_blocks = set()
        current_snapshot: dict[Path, float] = {}
        for file_path in self.iter_watch_files():
            try:
                mtime = file_path.stat().st_mtime
            except OSError:
                continue

            current_snapshot[file_path] = mtime
            previous = self.watch_snapshot.get(file_path)
            if previous is None or mtime > previous:
                owner = resolve_path_owner(file_path, self.specs)
                if owner:
                    changed_blocks.add(owner)

        removed_paths = set(self.watch_snapshot) - set(current_snapshot)
        for removed in removed_paths:
            owner = resolve_path_owner(removed, self.specs)
            if owner:
                changed_blocks.add(owner)

        self.watch_snapshot = current_snapshot
        return sorted(changed_blocks)

    def watch_loop(self):
        debounce_window = 0.75
        while not self.stop_event.is_set():
            if not self.watch_enabled:
                time.sleep(0.25)
                continue

            changed = self.detect_changed_blocks()
            if changed:
                self.pending_reload.update(changed)
                time.sleep(debounce_window)
                second_pass = self.detect_changed_blocks()
                self.pending_reload.update(second_pass)
                targets = sorted(self.pending_reload)
                self.pending_reload.clear()
                self.reload_blocks(targets, reason="watch")
            time.sleep(0.5)

    def monitor_loop(self):
        while not self.stop_event.is_set():
            for block_id in self.started_blocks:
                runtime = self.runtimes[block_id]
                process = runtime.process
                if process is None:
                    continue
                returncode = process.poll()
                if returncode is None:
                    continue
                if runtime.intentional_restart:
                    runtime.intentional_restart = False
                    runtime.running = False
                    continue
                log_system(f"{runtime.spec.name} stopped unexpectedly (exit code: {returncode})", icon=Theme.ERROR)
                self.shutdown()
                return
            time.sleep(1.0)

    def command_loop(self):
        global PROMPT_ACTIVE
        while not self.stop_event.is_set():
            try:
                with STDOUT_LOCK:
                    PROMPT_ACTIVE = True
                raw = input(runtime_prompt()).strip()
                with STDOUT_LOCK:
                    PROMPT_ACTIVE = False
            except EOFError:
                return
            except Exception:
                with STDOUT_LOCK:
                    PROMPT_ACTIVE = False
                time.sleep(0.25)
                continue

            if not raw:
                continue

            try:
                self.handle_command(raw)
            except ValueError as exc:
                log_system(str(exc), icon=Theme.WARN)

    def handle_command(self, raw: str):
        parts = shlex.split(raw)
        if not parts:
            return

        cmd = parts[0].lower()
        if cmd == "watch":
            if len(parts) > 1 and parts[1].lower() == "off":
                self.watch_enabled = False
                self.pending_reload.clear()
                log_system("Global watch disabled.", icon=Theme.INFO)
            else:
                self.watch_enabled = True
                self.refresh_watch_snapshot()
                log_system("Global watch enabled for all registered blocks.", icon=Theme.INFO)
            return

        if cmd == "status":
            self.print_status()
            return

        if cmd == "blocks":
            self.print_blocks()
            return

        if cmd == "rl":
            if len(parts) < 2:
                log_system("Usage: rl <block>", icon=Theme.WARN)
                return
            block_ids = self.resolve_command_block(parts[1])
            self.reload_blocks(block_ids, reason="manual")
            return

        if cmd == "exit":
            log_system("Exit command received. Shutting down pipeline...", icon=Theme.WARN)
            self.shutdown()
            return

        log_system(f"Unknown command '{raw}'. Try: blocks, status, watch, watch off, rl <block>, exit.", icon=Theme.WARN)

    def resolve_command_block(self, token: str) -> list[str]:
        resolved = []
        for block_id in self.alias_map.get(token.lower(), (token.lower(),)):
            if block_id not in self.specs:
                raise ValueError(f"Unknown block '{token}'")
            resolved.append(block_id)
        return resolved

    def print_blocks(self):
        for block_id, spec in self.specs.items():
            aliases = ", ".join(sorted(set(spec.aliases + (block_id,))))
            target_text = f" -> {', '.join(spec.reload_targets)}" if spec.reload_targets else ""
            state = "virtual" if spec.is_virtual else ("disabled" if not spec.enabled else "process")
            log_system(f"{block_id:<10} [{state}] aliases: {aliases}{target_text}", icon=Theme.INFO)

    def print_status(self):
        log_system(f"watch={'on' if self.watch_enabled else 'off'} pending={sorted(self.pending_reload)}", icon=Theme.INFO)
        for block_id in self.started_blocks:
            runtime = self.runtimes[block_id]
            process = runtime.process
            alive = process is not None and process.poll() is None
            log_system(f"{block_id:<10} running={alive}", icon=Theme.INFO)

    def run_background_threads(self):
        threading.Thread(target=self.watch_loop, daemon=True).start()
        threading.Thread(target=self.monitor_loop, daemon=True).start()

    def shutdown_handler(self, signum, frame):
        self.shutdown()
        sys.exit(0)

    def shutdown(self):
        if self.stop_event.is_set():
            return
        self.stop_event.set()
        print()
        log_system("Shutting down all components...")
        for block_id in reversed(self.started_blocks):
            self.stop_block(block_id)
        log_system("Shutdown complete.", icon=Theme.SUCCESS)

    def wait_forever(self):
        while not self.stop_event.is_set():
            time.sleep(0.5)


def main(argv: list[str] | None = None):
    parser = create_parser()
    args = parser.parse_args(argv)
    if args.remote:
        os.environ["API_ONLY"] = "1"

    orchestrator = PipelineOrchestrator(args)
    orchestrator.print_banner()
    orchestrator.prepare_frontend()
    orchestrator.install_signal_handlers()
    orchestrator.startup()
    orchestrator.run_background_threads()
    orchestrator.command_loop()


if __name__ == "__main__":
    main()
