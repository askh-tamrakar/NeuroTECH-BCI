import os
import sys
from pathlib import Path

# Try to find the project root dynamically, or fallback to the current file's ancestor
def get_project_root():
    # If we are running inside PyInstaller, sys._MEIPASS might exist, but usually we run from source
    
    # Start from this file's location: src/utils/paths.py
    current = Path(__file__).resolve()
    
    # Walk up until we find 'backend' and 'frontend' to identify root
    for parent in current.parents:
        if (parent / 'backend').exists() and (parent / 'frontend').exists():
            return parent
            
    # Fallback to pure relative (4 levels up from src/utils/paths.py)
    return current.parent.parent.parent.parent
    
PROJECT_ROOT = get_project_root()
FRONTEND_DIR = PROJECT_ROOT / "frontend"

def get_base_data_dir() -> Path:
    """
    Get the base directory for storing BCI data, models, and databases.
    In development, this defaults to 'frontend/public/data' for easy access by the dev server.
    In production, it checks the BCI_DATA_DIR environment variable, or defaults to a 'bci_data' folder next to the project root.
    """
    env_dir = os.environ.get("BCI_DATA_DIR")
    if env_dir:
        path = Path(env_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path
        
    # Check if we are likely in production (cPanel usually sets specific env vars, or we can check for node_modules)
    # A simple heuristical check: if frontend/public doesn't exist, we might be in a built environment
    public_dir = FRONTEND_DIR / "public"
    if public_dir.exists() and not os.environ.get("FLASK_ENV") == "production":
        # Development mode
        return public_dir / "data"
    else:
        # Production mode - store data outside the frontend folder to avoid serving raw DBs
        # Default to a 'bci_data' folder in the project root
        prod_data = PROJECT_ROOT / "bci_data"
        prod_data.mkdir(parents=True, exist_ok=True)
        return prod_data

def get_db_path(sensor_type: str) -> Path:
    base = get_base_data_dir()
    path = base / sensor_type.upper() / "processed" / f"{sensor_type.lower()}_data.db"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path

def get_models_dir(sensor_type: str) -> Path:
    base = get_base_data_dir()
    path = base / sensor_type.upper() / "models"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path

def get_config_dir() -> Path:
    path = PROJECT_ROOT / "config"
    path.mkdir(parents=True, exist_ok=True)
    return path
