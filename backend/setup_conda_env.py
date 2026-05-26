"""
NeuroTECH-BCI Conda Environment Setup
======================================
Creates a conda environment with the correct Python version and installs
all backend dependencies.

Usage:
    python setup_conda_env.py                           # default env name
    python setup_conda_env.py --name my_env             # custom env name
    python setup_conda_env.py --name my_env --neurobench  # + neurobench extras
    python setup_conda_env.py --force                   # recreate if exists

Requirements:
    - Miniforge / Miniconda / Anaconda installed (conda on PATH)
"""

import argparse
import subprocess
import sys
import os
from pathlib import Path

# ─── Configuration ────────────────────────────────────────────────────────────
DEFAULT_ENV_NAME  = "neurotech-bci"
PYTHON_VERSION    = "3.10"          # min 3.10 — union-type syntax in eeg_lda_trainer.py
REQUIREMENTS_FILE = Path(__file__).parent / "requirements.txt"

# Packages installed via conda first (avoids binary/ABI issues on Windows)
CONDA_PACKAGES = [
    "numpy",
    "scipy",
    "pandas",
    "matplotlib",
    "scikit-learn",
    "pyserial",
]

# Optional NeuroBench signal-simulator extras
NEUROBENCH_CONDA_PACKAGES = ["pyside6", "pyqtgraph"]
NEUROBENCH_PIP_PACKAGES   = ["brainflow>=5.12.0"]
# ─────────────────────────────────────────────────────────────────────────────


# ─── SSL fix ─────────────────────────────────────────────────────────────────
# PostgreSQL (and sometimes other tools) set CURL_CA_BUNDLE / REQUESTS_CA_BUNDLE
# to paths that may not exist on the current machine or live on a missing drive.
# When conda inherits these, every HTTPS request fails with an OSError.
# We detect bad paths and replace them with the miniforge3 bundle (if found),
# or simply unset them so Python's built-in certifi is used instead.

def _find_conda_root() -> Path | None:
    """Locate the conda installation root from env vars or PATH."""
    # 1. Explicit env var set by conda itself
    for var in ("CONDA_ROOT", "CONDA_EXE"):
        val = os.environ.get(var, "")
        if val:
            p = Path(val)
            root = p if p.is_dir() else p.parent.parent
            if (root / "Scripts" / "conda.exe").exists() or (root / "conda-meta").exists():
                return root

    # 2. Walk PATH for conda.exe
    for directory in os.environ.get("PATH", "").split(os.pathsep):
        candidate = Path(directory) / "conda.exe"
        if candidate.exists():
            # Scripts/ → root
            root = candidate.parent.parent
            if (root / "conda-meta").exists():
                return root

    return None


def _fix_ssl_env() -> None:
    """
    Sanitise TLS-related environment variables that may point to bad paths.
    Called once at startup so every subprocess.run() inherits the clean env.
    """
    conda_root = _find_conda_root()

    # Candidate CA-bundle paths inside the conda installation
    ca_candidates: list[Path] = []
    if conda_root:
        ca_candidates = [
            conda_root / "Library" / "mingw-w64" / "etc" / "ssl" / "certs" / "ca-bundle.crt",
            conda_root / "Library" / "ssl" / "cacert.pem",
            conda_root / "ssl" / "cacert.pem",
            conda_root / "Library" / "mingw-w64" / "ssl" / "certs" / "ca-bundle.crt",
        ]

    good_ca: str | None = None
    for p in ca_candidates:
        if p.exists():
            good_ca = str(p)
            break

    for var in ("CURL_CA_BUNDLE", "REQUESTS_CA_BUNDLE", "SSL_CERT_FILE"):
        current = os.environ.get(var, "")
        if not current:
            continue

        path_ok = Path(current).exists()
        if path_ok:
            continue   # existing path is fine — leave it alone

        # Bad path detected
        if good_ca:
            print(f"  ⚠️  {var} points to missing path: {current!r}")
            print(f"       → Replacing with conda bundle: {good_ca!r}")
            os.environ[var] = good_ca
        else:
            print(f"  ⚠️  {var} points to missing path: {current!r}")
            print(f"       → Unsetting (will use certifi defaults)")
            del os.environ[var]

    # Also make sure pip trusts the system/conda certs
    if good_ca and not os.environ.get("PIP_CERT"):
        os.environ["PIP_CERT"] = good_ca


# Apply SSL fix immediately so all subprocess calls inherit the clean env
_fix_ssl_env()


# ─── Helpers ─────────────────────────────────────────────────────────────────

def run(cmd: list[str], *, check: bool = True, capture: bool = False, **kwargs):
    """Run a subprocess command, streaming output unless capture=True."""
    print(f"\n▶  {' '.join(str(c) for c in cmd)}")
    if capture:
        result = subprocess.run(cmd, capture_output=True, text=True, **kwargs)
    else:
        result = subprocess.run(cmd, **kwargs)
    if check and result.returncode != 0:
        err = getattr(result, "stderr", "") or ""
        print(f"\n❌  Command failed (exit {result.returncode}): {' '.join(str(c) for c in cmd)}")
        if err:
            print(err)
        sys.exit(result.returncode)
    return result


def conda_available() -> bool:
    try:
        run(["conda", "--version"], capture=True, check=True)
        return True
    except (FileNotFoundError, SystemExit):
        return False


def env_exists(env_name: str) -> bool:
    result = run(["conda", "env", "list"], capture=True, check=False)
    for line in result.stdout.splitlines():
        parts = line.split()
        if parts and parts[0] == env_name:
            return True
    return False


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Set up the NeuroTECH-BCI conda environment."
    )
    parser.add_argument(
        "--name", "-n",
        default=DEFAULT_ENV_NAME,
        metavar="ENV_NAME",
        help=f"Conda environment name (default: {DEFAULT_ENV_NAME!r})",
    )
    parser.add_argument(
        "--python",
        default=PYTHON_VERSION,
        metavar="VERSION",
        help=f"Python version to install (default: {PYTHON_VERSION})",
    )
    parser.add_argument(
        "--neurobench",
        action="store_true",
        help="Also install NeuroBench simulator deps (PySide6, pyqtgraph, brainflow)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Remove and re-create the environment if it already exists",
    )
    args = parser.parse_args()

    env_name   = args.name
    python_ver = args.python

    # ── Preflight banner ──────────────────────────────────────────────────────
    print("\n" + "=" * 62)
    print("  NeuroTECH-BCI  ·  Conda Environment Setup")
    print("=" * 62)
    print(f"  Environment  : {env_name}")
    print(f"  Python       : {python_ver}")
    print(f"  NeuroBench   : {'yes' if args.neurobench else 'no  (--neurobench to enable)'}")
    print(f"  Requirements : {REQUIREMENTS_FILE}")
    print("=" * 62 + "\n")

    if not conda_available():
        print("❌  conda not found on PATH.")
        print("    Add miniforge3/Scripts to PATH, or open an Anaconda Prompt.")
        sys.exit(1)

    if not REQUIREMENTS_FILE.exists():
        print(f"❌  requirements.txt not found at {REQUIREMENTS_FILE}")
        sys.exit(1)

    # ── Handle existing environment ───────────────────────────────────────────
    if env_exists(env_name):
        if args.force:
            print(f"⚠️   Environment '{env_name}' exists — removing (--force)…")
            run(["conda", "env", "remove", "-n", env_name, "-y"])
        else:
            print(f"⚠️   Environment '{env_name}' already exists.")
            print("     Use --force to recreate it or choose a different --name.\n")
            answer = input("Update packages in the existing environment instead? [y/N] ").strip().lower()
            if answer != "y":
                print("Aborted.")
                sys.exit(0)
            _install_packages(env_name, args.neurobench)
            return

    # ── Step 1 · Create environment ───────────────────────────────────────────
    print(f"[1/4] Creating conda environment '{env_name}' with Python {python_ver}…")
    run([
        "conda", "create",
        "-n", env_name,
        "-c", "conda-forge",
        f"python={python_ver}",
        "-y",
        "--no-default-packages",
    ])

    _install_packages(env_name, args.neurobench)


def _install_packages(env_name: str, neurobench: bool) -> None:

    # ── Step 2 · conda-forge packages ────────────────────────────────────────
    conda_pkgs = list(CONDA_PACKAGES)
    if neurobench:
        conda_pkgs.extend(NEUROBENCH_CONDA_PACKAGES)

    print(f"\n[2/4] Installing binary packages via conda-forge…")
    run([
        "conda", "install",
        "-n", env_name,
        "-c", "conda-forge",
        "-y",
    ] + conda_pkgs)

    # ── Step 3 · pip requirements ─────────────────────────────────────────────
    print(f"\n[3/4] Installing pip requirements from requirements.txt…")
    # Use --ignore-requires-python so pip doesn't reject packages due to
    # system Python version; conda Python is already correct.
    run([
        "conda", "run", "--no-capture-output", "-n", env_name,
        "pip", "install",
        "-r", str(REQUIREMENTS_FILE),
        "--upgrade",
    ])

    # Optional NeuroBench pip extras
    if neurobench and NEUROBENCH_PIP_PACKAGES:
        print(f"\n   Installing NeuroBench extras (brainflow)…")
        run([
            "conda", "run", "--no-capture-output", "-n", env_name,
            "pip", "install",
        ] + NEUROBENCH_PIP_PACKAGES)

    # ── Step 4 · Validate ─────────────────────────────────────────────────────
    print(f"\n[4/4] Validating core imports…")
    validation_script = (
        "import flask, flask_cors, flask_socketio, eventlet; "
        "import numpy, scipy, pandas, sklearn, joblib; "
        "import pylsl, serial, matplotlib, pynput; "
        "print('✅  All core imports OK')"
    )
    result = run(
        ["conda", "run", "--no-capture-output", "-n", env_name,
         "python", "-c", validation_script],
        capture=False,
        check=False,
    )

    # ── Summary ───────────────────────────────────────────────────────────────
    print("\n" + "=" * 62)
    if result.returncode == 0:
        print(f"  ✅  Environment '{env_name}' is ready!")
    else:
        print(f"  ⚠️  Some imports failed — check output above.")
    print("=" * 62)
    print(f"\nTo activate:")
    print(f"    conda activate {env_name}\n")
    print(f"To run the backend:")
    print(f"    conda activate {env_name}")
    print(f"    python pipeline.py\n")


if __name__ == "__main__":
    main()
