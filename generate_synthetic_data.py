import sqlite3
import random
import time
import json
import os
from pathlib import Path

# Paths based on e:\WebSite\NeuroTECH-BCI\backend\src\utils\paths.py
PROJECT_ROOT = Path(r"e:\WebSite\NeuroTECH-BCI")
BASE_DATA_DIR = PROJECT_ROOT / "frontend" / "public" / "data"

COMPACT_EMG_FEATURE_COLUMNS = [
    "mav",
    "rms",
    "iemg",
    "var",
    "wl",
    "zc",
    "ssc",
    "mean_freq",
    "median_freq",
    "spectral_entropy",
    "d_mav",
    "d_rms",
    "d_iemg",
    "d_var",
    "d_wl",
    "d_zc",
    "d_ssc",
    "d_mean_freq",
    "d_median_freq",
    "d_spectral_entropy",
]

def get_db_path(sensor_type):
    return BASE_DATA_DIR / sensor_type.upper() / "processed" / f"{sensor_type.lower()}_data.db"

def get_session_metadata_path(sensor_type, session_name):
    path = BASE_DATA_DIR / sensor_type.upper() / "processed" / "sessions"
    path.mkdir(parents=True, exist_ok=True)
    return path / f"{session_name}.json"

def generate_eeg_data(conn, table_name, count=10000):
    cursor = conn.cursor()
    cursor.execute(f'''
        CREATE TABLE IF NOT EXISTS {table_name} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bp_delta REAL NOT NULL,
            bp_theta REAL NOT NULL,
            bp_alpha REAL NOT NULL,
            bp_beta REAL NOT NULL,
            bp_gamma REAL NOT NULL,
            rel_delta REAL NOT NULL,
            rel_theta REAL NOT NULL,
            rel_alpha REAL NOT NULL,
            rel_beta REAL NOT NULL,
            rel_gamma REAL NOT NULL,
            mean REAL NOT NULL,
            std REAL NOT NULL,
            max REAL NOT NULL,
            min REAL NOT NULL,
            score_1 REAL NOT NULL DEFAULT 0,
            score_2 REAL NOT NULL DEFAULT 0,
            score_3 REAL NOT NULL DEFAULT 0,
            score_4 REAL NOT NULL DEFAULT 0,
            score_5 REAL NOT NULL DEFAULT 0,
            score_6 REAL NOT NULL DEFAULT 0,
            max_score REAL NOT NULL DEFAULT 0,
            second_max_score REAL NOT NULL DEFAULT 0,
            score_ratio REAL NOT NULL DEFAULT 0,
            score_mean REAL NOT NULL DEFAULT 0,
            score_std REAL NOT NULL DEFAULT 0,
            dominant_freq REAL NOT NULL DEFAULT 0,
            peak_freq REAL NOT NULL DEFAULT 0,
            target_frequency REAL DEFAULT 0,
            channel_index INTEGER DEFAULT 0,
            sample_count INTEGER DEFAULT 0,
            window_ms REAL DEFAULT 0,
            metadata_json TEXT DEFAULT '',
            label INTEGER NOT NULL,
            session_id TEXT,
            timestamp REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    data = []
    start_ts = time.time() - count * 0.1 # roughly 10Hz
    for i in range(count):
        label = random.randint(1, 6) # SSVEP labels 1-6
        # Generate some random floats
        bp = [random.uniform(1.0, 100.0) for _ in range(5)]
        total_bp = sum(bp) + 1e-6
        rel = [v / total_bp for v in bp]
        scores = [random.uniform(0.0, 1.0) for _ in range(6)]
        
        row = (
            *bp, *rel,
            random.uniform(-10.0, 10.0), # mean
            random.uniform(1.0, 5.0), # std
            random.uniform(10.0, 50.0), # max
            random.uniform(-50.0, -10.0), # min
            *scores,
            max(scores), # max_score
            sorted(scores)[-2], # second_max_score
            max(scores) / (sum(scores) + 1e-6), # ratio
            sum(scores)/6, # score_mean
            random.uniform(0.1, 0.3), # score_std
            random.uniform(5.0, 40.0), # dominant
            random.uniform(5.0, 40.0), # peak
            15.0, # target_frequency (e.g. 15Hz)
            0, # channel_index
            128, # sample_count
            250.0, # window_ms
            '{}', # metadata
            label,
            "synthetic",
            start_ts + i * 0.1
        )
        data.append(row)
    
    cursor.executemany(f'''
        INSERT INTO {table_name} (
            bp_delta, bp_theta, bp_alpha, bp_beta, bp_gamma,
            rel_delta, rel_theta, rel_alpha, rel_beta, rel_gamma,
            mean, std, max, min,
            score_1, score_2, score_3, score_4, score_5, score_6,
            max_score, second_max_score, score_ratio, score_mean, score_std,
            dominant_freq, peak_freq, target_frequency,
            channel_index, sample_count, window_ms, metadata_json,
            label, session_id, timestamp
        ) VALUES ({",".join(["?"]*35)})
    ''', data)
    conn.commit()

def generate_emg_data(conn, table_name, count=10000):
    cursor = conn.cursor()
    cursor.execute(f'''
        CREATE TABLE IF NOT EXISTS {table_name} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mav REAL NOT NULL,
            rms REAL NOT NULL,
            iemg REAL NOT NULL,
            var REAL NOT NULL,
            wl REAL NOT NULL,
            zc REAL NOT NULL DEFAULT 0,
            ssc REAL NOT NULL DEFAULT 0,
            mean_freq REAL NOT NULL DEFAULT 0,
            median_freq REAL NOT NULL DEFAULT 0,
            spectral_entropy REAL NOT NULL DEFAULT 0,
            d_mav REAL NOT NULL DEFAULT 0,
            d_rms REAL NOT NULL DEFAULT 0,
            d_iemg REAL NOT NULL DEFAULT 0,
            d_var REAL NOT NULL DEFAULT 0,
            d_wl REAL NOT NULL DEFAULT 0,
            d_zc REAL NOT NULL DEFAULT 0,
            d_ssc REAL NOT NULL DEFAULT 0,
            d_mean_freq REAL NOT NULL DEFAULT 0,
            d_median_freq REAL NOT NULL DEFAULT 0,
            d_spectral_entropy REAL NOT NULL DEFAULT 0,
            label INTEGER NOT NULL,
            session_id TEXT,
            trial_group_id TEXT DEFAULT '',
            timestamp REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    data = []
    start_ts = time.time() - count * 0.05 
    for i in range(count):
        label = random.randint(0, 5) # EMG gestures 0-5
        mav = random.uniform(0.1, 2.0)
        rms = mav * 1.2
        row = (
            mav, rms, mav * 100, mav**2, mav * 0.5, # mav, rms, iemg, var, wl
            random.uniform(0, 30), # zc
            random.uniform(0, 30), # ssc
            random.uniform(50, 150), # mean_freq
            random.uniform(50, 150), # median_freq
            random.uniform(0.5, 0.9), # entropy
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, # deltas
            label,
            "synthetic",
            "", # trial_group
            start_ts + i * 0.05
        )
        data.append(row)
        
    cursor.executemany(f'''
        INSERT INTO {table_name} (
            mav, rms, iemg, var, wl, zc, ssc, mean_freq, median_freq, spectral_entropy,
            d_mav, d_rms, d_iemg, d_var, d_wl, d_zc, d_ssc, d_mean_freq, d_median_freq, d_spectral_entropy,
            label, session_id, trial_group_id, timestamp
        ) VALUES ({",".join(["?"]*24)})
    ''', data)
    conn.commit()

def generate_eog_data(conn, table_name, count=10000):
    cursor = conn.cursor()
    cursor.execute(f'''
        CREATE TABLE IF NOT EXISTS {table_name} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            amplitude REAL NOT NULL,
            duration_ms REAL NOT NULL,
            rise_time_ms REAL NOT NULL,
            fall_time_ms REAL NOT NULL,
            asymmetry REAL NOT NULL,
            peak_count INTEGER NOT NULL,
            kurtosis REAL NOT NULL,
            skewness REAL NOT NULL,
            confidence REAL DEFAULT 0,
            source TEXT DEFAULT 'manual',
            corrected_label INTEGER,
            label INTEGER NOT NULL,
            session_id TEXT,
            trial_group_id TEXT DEFAULT '',
            timestamp REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    data = []
    start_ts = time.time() - count * 0.5 # slower events
    for i in range(count):
        label = random.randint(0, 3) # left, right, up, down
        row = (
            random.uniform(50, 500), # amplitude
            random.uniform(100, 400), # duration
            random.uniform(40, 150), # rise
            random.uniform(40, 150), # fall
            random.uniform(-1, 1), # asymmetry
            1, # peak_count
            random.uniform(1, 4), # kurtosis
            random.uniform(-1, 1), # skewness
            0.95, # confidence
            'synthetic', # source
            None, # corrected
            label,
            "synthetic",
            "",
            start_ts + i * 0.5
        )
        data.append(row)
        
    cursor.executemany(f'''
        INSERT INTO {table_name} (
            amplitude, duration_ms, rise_time_ms, fall_time_ms, asymmetry,
            peak_count, kurtosis, skewness, confidence, source, corrected_label,
            label, session_id, trial_group_id, timestamp
        ) VALUES ({",".join(["?"]*15)})
    ''', data)
    conn.commit()

def save_metadata(sensor, table_name):
    metadata = {
        "sensor": sensor,
        "table_name": table_name,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sample_count": 10000,
        "type": "synthetic"
    }
    
    if sensor == "EMG":
        metadata.update({
            "storage_format": "compact_emg_v2",
            "feature_columns": COMPACT_EMG_FEATURE_COLUMNS,
        })
    elif sensor == "EEG":
         metadata["storage_format"] = "eeg_v1"
    elif sensor == "EOG":
         metadata["storage_format"] = "eog_v1"
         
    path = get_session_metadata_path(sensor, table_name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    print(f"Saved metadata to {path}")

def main():
    sensors = ['EEG', 'EMG', 'EOG']
    for sensor in sensors:
        db_path = get_db_path(sensor)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        print(f"Connecting to {db_path}...")
        conn = sqlite3.connect(db_path)
        table_name = f"{sensor.lower()}_session_synthetic"
        
        # Drop if exists to ensure 10000 fresh samples
        cursor = conn.cursor()
        cursor.execute(f"DROP TABLE IF EXISTS {table_name}")
        
        if sensor == 'EEG':
            generate_eeg_data(conn, table_name)
        elif sensor == 'EMG':
            generate_emg_data(conn, table_name)
        elif sensor == 'EOG':
            generate_eog_data(conn, table_name)
            
        print(f"Generated 10000 samples for {sensor} in {table_name}")
        conn.close()
        
        # Save metadata
        save_metadata(sensor, table_name)

if __name__ == "__main__":
    main()
