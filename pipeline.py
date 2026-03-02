import subprocess
import sys
import argparse
import time
import signal
import threading
from pathlib import Path

# Visual Theme & Formatting
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
    
    # System Icons
    SYS = f"{BOLD}{OKCYAN}⚙{RESET}"
    SUCCESS = f"{BOLD}{OKGREEN}✔{RESET}"
    ERROR = f"{BOLD}{FAIL}✘{RESET}"
    INFO = f"{BOLD}{OKBLUE}ℹ{RESET}"
    WARN = f"{BOLD}{WARNING}⚠{RESET}"
    BUILD = f"{BOLD}{HEADER}🔨{RESET}"
    LAUNCH = f"{BOLD}{OKCYAN}🚀{RESET}"

def get_timestamp():
    """Return formatted timestamp for logs."""
    return f"{Theme.DIM}[{time.strftime('%H:%M:%S')}] {Theme.RESET}"

def log_system(msg, icon=Theme.SYS):
    """Log a system-level message."""
    print(f"{get_timestamp()}{icon} {Theme.BOLD}{msg}{Theme.RESET}")

try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

processes = []
ready_events = {}

# Configuration
COMPONENTS = [
    {
        "name": "Stream Manager",
        "module": "src.acquisition.stream_manager",
        "color": Theme.HEADER,
        "ready_pattern": "[StreamManager] Created stream 'BioSignals-Events'",
        "success_msg": "LSL Stream Manager started and connected"
    },
    {
        "name": "Filter Router",
        "module": "src.processing.filter_router",
        "color": Theme.OKBLUE,
        "ready_pattern": "[Router] [OK] Connected to raw stream",
        "success_msg": "Filter Router connected to raw stream"
    },
    {
        "name": "Feature Router",
        "module": "src.feature.router",
        "color": Theme.OKGREEN,
        "ready_pattern": "[FeatureRouter] [OK] Connected to BioSignals-Processed",
        "success_msg": "Feature Router connected and processing"
    },
    {
        "name": "Web Server",
        "module": "src.server.web_server",
        "color": Theme.WARNING,
        "ready_pattern": None,
        "success_msg": "Web Config Server started"
    }
]

def log_process(process, name, color, ready_pattern=None, ready_event=None, success_msg=None, verbose=False):
    """Log process output and detect ready pattern."""
    prefix = f"{color}{Theme.BOLD}[{name:^15}]{Theme.RESET}"
    
    # Always print these types of logs, even if not verbose
    allowlist = ["[Config]", "[Model]", "Event:", "Exception", "Error"]

    for line in iter(process.stdout.readline, b''):
        try:
            msg = line.decode('utf-8', errors='replace').strip()
            
            # Print output if verbose, or if it matches an allowed keyword
            should_print = verbose or any(keyword in msg for keyword in allowlist)
            
            if should_print:
                print(f"{get_timestamp()}{prefix} {msg}")
            
            if ready_pattern and ready_event and not ready_event.is_set():
                if ready_pattern in msg:
                    ready_msg = success_msg if success_msg else f"{name} is READY"
                    log_system(ready_msg, icon=Theme.SUCCESS)
                    ready_event.set()
        except Exception:
            pass

def shutdown_handler(signum, frame):
    """Gracefully shutdown all processes."""
    print()
    log_system("Shutting down all components...")
    for p in processes:
        log_system(f"Terminating {p.name}...")
        p.terminate()
    
    # Wait for processes to exit
    for p in processes:
        try:
            p.wait(timeout=5)
        except subprocess.TimeoutExpired:
            log_system(f"Force killing {p.name}...", icon=Theme.WARN)
            p.kill()
    
    log_system("Shutdown complete.", icon=Theme.SUCCESS)
    sys.exit(0)

def main():
    parser = argparse.ArgumentParser(description="NeuroTECH System Orchestrator")
    parser.add_argument("-b", "--build", action="store_true", help="Build frontend before starting")
    parser.add_argument("-d", "--dev", action="store_true", help="Run in development mode (starts Vite dev server)")
    parser.add_argument("-v", "--verbose", action="store_true", help="Show detailed subprocess logs")
    args = parser.parse_args()

    # --- STARTUP BANNER ---
    banner = r"""
                                                            
     ███╗   ██╗███████╗██╗   ██╗██████╗  ██████╗ ████████╗███████╗ ██████╗██╗  ██╗
     ████╗  ██║██╔════╝██║   ██║██╔══██╗██╔═══██╗╚══██╔══╝██╔════╝██╔════╝██║  ██║
     ██╔██╗ ██║█████╗  ██║   ██║██████╔╝██║   ██║   ██║   █████╗  ██║     ███████║
     ██║╚██╗██║██╔══╝  ██║   ██║██╔══██╗██║   ██║   ██║   ██╔══╝  ██║     ██╔══██║
     ██║ ╚████║███████╗╚██████╔╝██║  ██║╚██████╔╝   ██║   ███████╗╚██████╗██║  ██║
     ╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝    ╚═╝   ╚══════╝ ╚═════╝╚═╝  ╚═╝

    """
    
    print(f"\n{Theme.HEADER}{Theme.BOLD}")
    print("=" * 88)
    print(banner.strip("\n"))
    print("=" * 88)
    print(f"             SYSTEM ORCHESTRATOR v0.1.0{Theme.RESET}")
    print(f"  {Theme.DIM}Mode: {'Development' if args.dev else 'Production'}{Theme.RESET}")
    print()

    frontend_dir = Path("frontend").resolve()
    python_exe = sys.executable

    # --- 1. BUILD PHASE (Optional) ---
    if args.build:
        log_system("Building frontend...", icon=Theme.BUILD)
        try:
            # Install dependencies if node_modules missing
            if not (frontend_dir / "node_modules").exists():
                    log_system("Installing npm dependencies...")
                    subprocess.run(["npm", "install"], cwd=frontend_dir, shell=True, check=True)
            
            # Run Build
            log_system("Running npm run build...")
            subprocess.run(["npm", "run", "build"], cwd=frontend_dir, shell=True, check=True)
            log_system("Frontend built successfully!", icon=Theme.SUCCESS)
        except Exception as e:
            log_system(f"Frontend build FAILED: {e}", icon=Theme.ERROR)
            log_system("Continuing anyway...", icon=Theme.WARN)
    else:
        if args.dev:
             log_system("Skipping build (Dev Mode active)...", icon=Theme.INFO)
        else:
             log_system("Skipping build (Using existing 'dist')...", icon=Theme.INFO)

    # Register signal handler
    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)

    # --- 2. START DEV SERVER (Optional) ---
    if args.dev:
        log_system("Starting Frontend Development Server (Vite)...", icon=Theme.LAUNCH)
        try:
             dev_proc = subprocess.Popen(
                ["npm", "run", "dev"], 
                cwd=frontend_dir,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT
             )
             dev_proc.name = "Frontend Dev"
             processes.append(dev_proc)

             # Log vite output in background
             t_dev = threading.Thread(
                target=log_process, 
                args=(dev_proc, "Frontend", Theme.OKCYAN, None, None, "Vite Dev Server started", args.verbose),
                daemon=True
             )
             t_dev.start()

        except Exception as e:
            log_system(f"Failed to start Dev Server: {e}", icon=Theme.ERROR)


    # --- 3. START BACKEND COMPONENTS ---
    for component in COMPONENTS:
        name = component["name"]
        log_system(f"Launching {name}...", icon=Theme.LAUNCH)
        
        ready_event = threading.Event()
        proc = subprocess.Popen(
            [python_exe, "-u", "-m", component["module"]],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            cwd=str(Path(__file__).parent)
        )
        
        proc.name = name
        processes.append(proc)
        
        # Start logging thread
        t = threading.Thread(
            target=log_process, 
            args=(proc, name, component["color"], component["ready_pattern"], ready_event, component.get("success_msg"), args.verbose),
            daemon=True
        )
        t.start()

        # Wait for component to be ready if it has a pattern
        if component["ready_pattern"]:
            log_system(f"Waiting for {name} to initialize...", icon=Theme.SYS)
            # Wait up to 30 seconds for connection
            if not ready_event.wait(timeout=30.0):
                log_system(f"ERROR: {name} timed out while connecting!", icon=Theme.ERROR)
                shutdown_handler(None, None)
            time.sleep(0.5)

    print()
    log_system("All components running. Press Ctrl+C to stop.", icon=Theme.SUCCESS)
    print()

    # Monitor processes
    while True:
        for p in processes:
            if p.poll() is not None:
                log_system(f"{p.name} has stopped (exit code: {p.returncode})", icon=Theme.ERROR)
                shutdown_handler(None, None)
        time.sleep(1)

if __name__ == "__main__":
    main()
