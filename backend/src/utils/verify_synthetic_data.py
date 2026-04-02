from src.database.db_manager import DatabaseManager

def verify_synthetic_data():
    db = DatabaseManager()
    sensors = ["EMG", "EEG", "EOG"]
    session_name = "synthetic_session_10k"
    
    for sensor in sensors:
        conn = db.connect(sensor)
        cursor = conn.cursor()
        
        # Determine table name (DatabaseManager.create_session_table logic)
        prefix = f"{sensor.lower()}_session_"
        table_name = f"{prefix}{session_name}"
        
        cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
        count = cursor.fetchone()[0]
        print(f"Sensor {sensor}: Table {table_name} has {count} rows.")
        
        if sensor in ["EMG", "EEG"]:
            cursor.execute(f"SELECT trial_id FROM {table_name} LIMIT 10")
            trial_ids = [row[0] for row in cursor.fetchall()]
            print(f"Sensor {sensor}: First 10 trial_ids: {trial_ids}")
            
            cursor.execute(f"SELECT trial_id FROM {table_name} ORDER BY id DESC LIMIT 5")
            last_trial_ids = [row[0] for row in cursor.fetchall()]
            print(f"Sensor {sensor}: Last 5 trial_ids: {last_trial_ids}")
            
        conn.close()

if __name__ == "__main__":
    verify_synthetic_data()
