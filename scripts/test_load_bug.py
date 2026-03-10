import sys
from pathlib import Path

# Add project root
project_root = Path(__file__).resolve().parent.parent
sys.path.append(str(project_root))

from src.learning.model_trainer import load_model

print("Testing load_model with single argument (Bug Reproduction)...")
try:
    # Simulating the bug in training_routes.py
    load_model("lucifer-600") 
except TypeError as e:
    print(f"caught expected TypeError: {e}")
except Exception as e:
    print(f"caught unexpected Exception: {e}")

print("\nTesting load_model with correct arguments...")
try:
    res = load_model("EMG", "lucifer-600")
    print(f"Result: {res}")
except Exception as e:
    print(f"Correct call failed: {e}")
