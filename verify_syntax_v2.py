import py_compile
import sys
import importlib.util

files = [
    r"src\learning\emg_trainer.py",
    r"src\web\server\routes\training_routes.py",
    r"src\feature\detectors\rps_detector.py"
]

print("Verifying syntax...")
for f in files:
    try:
        py_compile.compile(f, doraise=True)
        print(f"[OK] {f}")
    except Exception as e:
        print(f"[ERROR] {f}: {e}")
        sys.exit(1)

print("Syntax verification passed.")
