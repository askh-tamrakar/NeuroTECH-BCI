import os
import sys
from pathlib import Path

import uvicorn

# Force single-threading for math libraries to avoid oversubscription during
# high-frequency streaming and background model work.
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from src.server.server import create_app

app = create_app()


def main():
    print("Starting Web Server...")
    uvicorn.run(app, host="0.0.0.0", port=5005, log_level="warning")


if __name__ == "__main__":
    main()
