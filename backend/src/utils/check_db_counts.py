import sqlite3
from pathlib import Path

# Paths
PROJECT_ROOT = Path("i:/Neuroscience/Brain-To-Brain-Telepathic-Communication-System")
BASE_DATA_DIR = PROJECT_ROOT / "frontend" / "public" / "data"
EMG_DB = BASE_DATA_DIR / "EMG" / "processed" / "emg_data.db"
EOG_DB = BASE_DATA_DIR / "EOG" / "processed" / "eog_data.db"

def check_db(db_path, sensor_name):
    print(f"--- Checking {sensor_name} DB ---")
    if not db_path.exists():
        print(f"❌ {db_path} does not exist.")
        return

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get all tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        
        for table in tables:
            t_name = table[0]
            if "sequence" in t_name: continue
            
            cursor.execute(f"SELECT COUNT(*) FROM {t_name}")
            count = cursor.fetchone()[0]
            print(f"Table '{t_name}': {count} rows")
        
        conn.close()
    except Exception as e:
        print(f"Error reading {sensor_name} DB: {e}")

if __name__ == "__main__":
    check_db(EMG_DB, "EMG")
    check_db(EOG_DB, "EOG")
