import json
import sqlite3
import re
import threading
from typing import Dict, Optional, List, Any
from src.utils.paths import get_base_data_dir, get_db_path


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

COMPACT_EMG_SESSION_COLUMN_DEFS = {
    "id": "INTEGER PRIMARY KEY AUTOINCREMENT",
    "label": "INTEGER NOT NULL",
    "trial": "TEXT DEFAULT ''",
    "mav": "REAL NOT NULL",
    "rms": "REAL NOT NULL",
    "iemg": "REAL NOT NULL",
    "var": "REAL NOT NULL",
    "wl": "REAL NOT NULL",
    "zc": "REAL NOT NULL DEFAULT 0",
    "ssc": "REAL NOT NULL DEFAULT 0",
    "mean_freq": "REAL NOT NULL DEFAULT 0",
    "median_freq": "REAL NOT NULL DEFAULT 0",
    "spectral_entropy": "REAL NOT NULL DEFAULT 0",
    "d_mav": "REAL NOT NULL DEFAULT 0",
    "d_rms": "REAL NOT NULL DEFAULT 0",
    "d_iemg": "REAL NOT NULL DEFAULT 0",
    "d_var": "REAL NOT NULL DEFAULT 0",
    "d_wl": "REAL NOT NULL DEFAULT 0",
    "d_zc": "REAL NOT NULL DEFAULT 0",
    "d_ssc": "REAL NOT NULL DEFAULT 0",
    "d_mean_freq": "REAL NOT NULL DEFAULT 0",
    "d_median_freq": "REAL NOT NULL DEFAULT 0",
    "d_spectral_entropy": "REAL NOT NULL DEFAULT 0",
    "metadata_json": "TEXT DEFAULT ''",
    "source": "TEXT DEFAULT 'manual'",
    "session_id": "TEXT",
    "timestamp": "REAL",
    "created_at": "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
}

COMPACT_EOG_SESSION_COLUMN_DEFS = {
    "id": "INTEGER PRIMARY KEY AUTOINCREMENT",
    "label": "INTEGER NOT NULL",
    "serial_id": "INTEGER NOT NULL",
    "amplitude": "REAL NOT NULL",
    "duration_ms": "REAL NOT NULL",
    "rise_time_ms": "REAL NOT NULL",
    "fall_time_ms": "REAL NOT NULL",
    "asymmetry": "REAL NOT NULL",
    "peak_count": "INTEGER NOT NULL",
    "kurtosis": "REAL NOT NULL",
    "skewness": "REAL NOT NULL",
    "source": "TEXT DEFAULT 'manual'",
    "session_id": "TEXT",
    "timestamp": "REAL",
    "created_at": "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
}

COMPACT_EEG_SESSION_COLUMN_DEFS = {
    "id": "INTEGER PRIMARY KEY AUTOINCREMENT",
    "label": "INTEGER NOT NULL",
    "target_frequency": "REAL DEFAULT 0",
    "trial": "TEXT DEFAULT ''",
    "bp_delta": "REAL NOT NULL",
    "bp_theta": "REAL NOT NULL",
    "bp_alpha": "REAL NOT NULL",
    "bp_beta": "REAL NOT NULL",
    "bp_gamma": "REAL NOT NULL",
    "rel_delta": "REAL NOT NULL",
    "rel_theta": "REAL NOT NULL",
    "rel_alpha": "REAL NOT NULL",
    "rel_beta": "REAL NOT NULL",
    "rel_gamma": "REAL NOT NULL",
    "mean": "REAL NOT NULL",
    "std": "REAL NOT NULL",
    "max": "REAL NOT NULL",
    "min": "REAL NOT NULL",
    "score_1": "REAL NOT NULL DEFAULT 0",
    "score_2": "REAL NOT NULL DEFAULT 0",
    "score_3": "REAL NOT NULL DEFAULT 0",
    "score_4": "REAL NOT NULL DEFAULT 0",
    "score_5": "REAL NOT NULL DEFAULT 0",
    "score_6": "REAL NOT NULL DEFAULT 0",
    "max_score": "REAL NOT NULL DEFAULT 0",
    "second_max_score": "REAL NOT NULL DEFAULT 0",
    "score_ratio": "REAL NOT NULL DEFAULT 0",
    "score_mean": "REAL NOT NULL DEFAULT 0",
    "score_std": "REAL NOT NULL DEFAULT 0",
    "dominant_freq": "REAL NOT NULL DEFAULT 0",
    "peak_freq": "REAL NOT NULL DEFAULT 0",
    "metadata_json": "TEXT DEFAULT ''",
    "session_id": "TEXT",
    "timestamp": "REAL",
    "created_at": "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
}

class DatabaseManager:
    def __init__(self):
        
        self.db_paths = {
            'EMG': get_db_path('EMG'),
            'EOG': get_db_path('EOG'),
            'EEG': get_db_path('EEG')
        }
        
        # Ensure directories exist
        for path in self.db_paths.values():
            path.parent.mkdir(parents=True, exist_ok=True)
        
        self._verified_tables = set()
        self._schema_lock = threading.Lock()
        
        self._init_dbs()
        
    def connect(self, sensor_type: str):
        """Get database connection for specific sensor."""
        sensor = sensor_type.upper()
        if sensor not in self.db_paths:
            raise ValueError(f"Unknown sensor type: {sensor}")
        conn = sqlite3.connect(
            str(self.db_paths[sensor]),
            timeout=30.0,
            check_same_thread=False,
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA busy_timeout = 30000;")
        conn.execute("PRAGMA foreign_keys = ON;")
        return conn

    def initialize_runtime(self):
        """Warm up and verify database schemas for the active runtime."""
        with self._schema_lock:
            self._init_dbs()

    def _init_dbs(self):
        """Initialize all databases."""
        # EMG
        conn = self.connect('EMG')
        self._create_emg_table(conn.cursor(), "emg_windows")
        self._ensure_emg_columns(conn, "emg_windows")
        self._migrate_emg_session_tables(conn)
        conn.commit()
        conn.close()

        # EOG
        conn = self.connect('EOG')
        self._create_eog_table(conn.cursor(), "eog_windows")
        self._ensure_eog_columns(conn, "eog_windows")
        conn.commit()
        conn.close()

        # EEG
        conn = self.connect('EEG')
        self._create_eeg_table(conn.cursor(), "eeg_windows")
        self._ensure_eeg_columns(conn, "eeg_windows")
        self._migrate_eeg_session_tables(conn)
        conn.commit()
        conn.close()

    def _create_emg_table(self, cursor, table_name):
        cursor.execute(f'''
            CREATE TABLE IF NOT EXISTS {table_name} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                label INTEGER NOT NULL,
                trial TEXT DEFAULT '',
                rms REAL NOT NULL,
                mav REAL NOT NULL,
                var REAL NOT NULL,
                wl REAL NOT NULL,
                peak REAL NOT NULL,
                range REAL NOT NULL,
                iemg REAL NOT NULL,
                entropy REAL NOT NULL,
                energy REAL NOT NULL,
                kurtosis REAL NOT NULL,
                skewness REAL NOT NULL,
                ssc REAL NOT NULL,
                wamp REAL NOT NULL,
                zc REAL NOT NULL DEFAULT 0,
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
                channel_index INTEGER DEFAULT 0,
                sample_count INTEGER DEFAULT 0,
                window_ms REAL DEFAULT 0,
                capture_window_ms REAL DEFAULT 0,
                sampling_rate REAL DEFAULT 0,
                session_window_ms REAL DEFAULT 0,
                session_overlap REAL DEFAULT 0,
                session_stride_ms REAL DEFAULT 0,
                gap_ms REAL DEFAULT 0,
                metadata_json TEXT DEFAULT '',
                confidence REAL DEFAULT 0,
                source TEXT DEFAULT 'manual',
                corrected_label INTEGER,
                session_id TEXT,
                timestamp REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_label ON {table_name}(label)')

    def _create_emg_session_table(self, cursor, table_name):
        columns_sql = ",\n                ".join(
            f"{column} {definition}" for column, definition in COMPACT_EMG_SESSION_COLUMN_DEFS.items()
        )
        cursor.execute(f'''
            CREATE TABLE IF NOT EXISTS {table_name} (
                {columns_sql}
            )
        ''')
        cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_label ON {table_name}(label)')

    def _create_eog_table(self, cursor, table_name):
        cursor.execute(f'''
            CREATE TABLE IF NOT EXISTS {table_name} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                label INTEGER NOT NULL,
                serial_id INTEGER DEFAULT 0,
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
                session_id TEXT,
                timestamp REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_label ON {table_name}(label)')

    def _create_eog_session_table(self, cursor, table_name):
        columns_sql = ",\n                ".join(
            f"{column} {definition}" for column, definition in COMPACT_EOG_SESSION_COLUMN_DEFS.items()
        )
        cursor.execute(f'''
            CREATE TABLE IF NOT EXISTS {table_name} (
                {columns_sql}
            )
        ''')
        cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_label ON {table_name}(label)')

    def _create_eeg_table(self, cursor, table_name):
        cursor.execute(f'''
            CREATE TABLE IF NOT EXISTS {table_name} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                label TEXT NOT NULL,
                trial TEXT DEFAULT '',
                target_frequency REAL DEFAULT 0,
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
                channel_index INTEGER DEFAULT 0,
                sample_count INTEGER DEFAULT 0,
                window_ms REAL DEFAULT 0,
                metadata_json TEXT DEFAULT '',
                session_id TEXT,
                timestamp REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_label ON {table_name}(label)')

    def _create_eeg_session_table(self, cursor, table_name):
        columns_sql = ",\n                ".join(
            f"{column} {definition}" for column, definition in COMPACT_EEG_SESSION_COLUMN_DEFS.items()
        )
        cursor.execute(f'''
            CREATE TABLE IF NOT EXISTS {table_name} (
                {columns_sql}
            )
        ''')
        cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_label ON {table_name}(label)')

    def _migrate_emg_session_tables(self, conn):
        """Find all session-specific EMG labels and ensure they have the latest schema."""
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'emg_session_%'")
        tables = [row[0] for row in cursor.fetchall()]
        for table in tables:
            self._ensure_emg_session_columns(conn, table)

    def _migrate_eeg_session_tables(self, conn):
        """Find all session-specific EEG labels and ensure they have the latest schema."""
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'eeg_session_%'")
        tables = [row[0] for row in cursor.fetchall()]
        for table in tables:
            self._ensure_eeg_session_columns(conn, table)

    def _ensure_columns(self, conn, table_name: str, columns: Dict[str, str]):
        cursor = conn.cursor()
        cursor.execute(f"PRAGMA table_info({table_name})")
        existing = {row[1] for row in cursor.fetchall()}
        for column_name, column_type in columns.items():
            if column_name not in existing:
                cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")

    def _ensure_emg_columns(self, conn, table_name: str):
        self._ensure_columns(conn, table_name, {
            "trial": "TEXT DEFAULT ''",
            "zc": "REAL NOT NULL DEFAULT 0",
            "mean_freq": "REAL NOT NULL DEFAULT 0",
            "median_freq": "REAL NOT NULL DEFAULT 0",
            "spectral_entropy": "REAL NOT NULL DEFAULT 0",
            "d_mav": "REAL NOT NULL DEFAULT 0",
            "d_rms": "REAL NOT NULL DEFAULT 0",
            "d_iemg": "REAL NOT NULL DEFAULT 0",
            "d_var": "REAL NOT NULL DEFAULT 0",
            "d_wl": "REAL NOT NULL DEFAULT 0",
            "d_zc": "REAL NOT NULL DEFAULT 0",
            "d_ssc": "REAL NOT NULL DEFAULT 0",
            "d_mean_freq": "REAL NOT NULL DEFAULT 0",
            "d_median_freq": "REAL NOT NULL DEFAULT 0",
            "d_spectral_entropy": "REAL NOT NULL DEFAULT 0",
            "channel_index": "INTEGER DEFAULT 0",
            "sample_count": "INTEGER DEFAULT 0",
            "window_ms": "REAL DEFAULT 0",
            "capture_window_ms": "REAL DEFAULT 0",
            "sampling_rate": "REAL DEFAULT 0",
            "session_window_ms": "REAL DEFAULT 0",
            "session_overlap": "REAL DEFAULT 0",
            "session_stride_ms": "REAL DEFAULT 0",
            "gap_ms": "REAL DEFAULT 0",
            "metadata_json": "TEXT DEFAULT ''",
            "confidence": "REAL DEFAULT 0",
            "source": "TEXT DEFAULT 'manual'",
            "corrected_label": "INTEGER",
        })
        # Create index after ensuring column exists
        cursor = conn.cursor()
        cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_label ON {table_name}(label)')
        cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_trial ON {table_name}(trial)')

    def _ensure_emg_session_columns(self, conn, table_name: str):
        self._ensure_columns(conn, table_name, {
            "label": "INTEGER NOT NULL DEFAULT 0",
            "trial": "TEXT DEFAULT ''",
            "mav": "REAL NOT NULL DEFAULT 0",
            "rms": "REAL NOT NULL DEFAULT 0",
            "iemg": "REAL NOT NULL DEFAULT 0",
            "var": "REAL NOT NULL DEFAULT 0",
            "wl": "REAL NOT NULL DEFAULT 0",
            "zc": "REAL NOT NULL DEFAULT 0",
            "ssc": "REAL NOT NULL DEFAULT 0",
            "mean_freq": "REAL NOT NULL DEFAULT 0",
            "median_freq": "REAL NOT NULL DEFAULT 0",
            "spectral_entropy": "REAL NOT NULL DEFAULT 0",
            "d_mav": "REAL NOT NULL DEFAULT 0",
            "d_rms": "REAL NOT NULL DEFAULT 0",
            "d_iemg": "REAL NOT NULL DEFAULT 0",
            "d_var": "REAL NOT NULL DEFAULT 0",
            "d_wl": "REAL NOT NULL DEFAULT 0",
            "d_zc": "REAL NOT NULL DEFAULT 0",
            "d_ssc": "REAL NOT NULL DEFAULT 0",
            "d_mean_freq": "REAL NOT NULL DEFAULT 0",
            "d_median_freq": "REAL NOT NULL DEFAULT 0",
            "d_spectral_entropy": "REAL NOT NULL DEFAULT 0",
            "metadata_json": "TEXT DEFAULT ''",
            "source": "TEXT DEFAULT 'manual'",
        })
        cursor = conn.cursor()
        cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_label ON {table_name}(label)')
        cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_trial ON {table_name}(trial)')

    def _ensure_eeg_columns(self, conn, table_name: str):
        self._ensure_columns(conn, table_name, {
            "trial": "TEXT DEFAULT ''",
            "score_1": "REAL NOT NULL DEFAULT 0",
            "score_2": "REAL NOT NULL DEFAULT 0",
            "score_3": "REAL NOT NULL DEFAULT 0",
            "score_4": "REAL NOT NULL DEFAULT 0",
            "score_5": "REAL NOT NULL DEFAULT 0",
            "score_6": "REAL NOT NULL DEFAULT 0",
            "max_score": "REAL NOT NULL DEFAULT 0",
            "second_max_score": "REAL NOT NULL DEFAULT 0",
            "score_ratio": "REAL NOT NULL DEFAULT 0",
            "score_mean": "REAL NOT NULL DEFAULT 0",
            "score_std": "REAL NOT NULL DEFAULT 0",
            "dominant_freq": "REAL NOT NULL DEFAULT 0",
            "peak_freq": "REAL NOT NULL DEFAULT 0",
            "target_frequency": "REAL DEFAULT 0",
            "channel_index": "INTEGER DEFAULT 0",
            "sample_count": "INTEGER DEFAULT 0",
            "window_ms": "REAL DEFAULT 0",
            "metadata_json": "TEXT DEFAULT ''",
        })
        cursor = conn.cursor()
        cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_label ON {table_name}(label)')
        cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_trial ON {table_name}(trial)')

    def _ensure_eog_columns(self, conn, table_name: str):
        self._ensure_columns(conn, table_name, {
            "serial_id": "INTEGER DEFAULT 0",
            "confidence": "REAL DEFAULT 0",
            "source": "TEXT DEFAULT 'manual'",
            "corrected_label": "INTEGER",
        })
        cursor = conn.cursor()
        cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_label ON {table_name}(label)')
        cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_serial ON {table_name}(serial_id)')

    def _ensure_eog_session_columns(self, conn, table_name: str):
        self._ensure_columns(conn, table_name, {
            "label": "INTEGER NOT NULL DEFAULT 0",
            "serial_id": "INTEGER DEFAULT 0",
            "amplitude": "REAL NOT NULL DEFAULT 0",
            "duration_ms": "REAL NOT NULL DEFAULT 0",
            "rise_time_ms": "REAL NOT NULL DEFAULT 0",
            "fall_time_ms": "REAL NOT NULL DEFAULT 0",
            "asymmetry": "REAL NOT NULL DEFAULT 0",
            "peak_count": "INTEGER NOT NULL DEFAULT 0",
            "kurtosis": "REAL NOT NULL DEFAULT 0",
            "skewness": "REAL NOT NULL DEFAULT 0",
            "source": "TEXT DEFAULT 'manual'",
        })
        cursor = conn.cursor()
        cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_label ON {table_name}(label)')
        cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_serial ON {table_name}(serial_id)')

    def _ensure_eeg_session_columns(self, conn, table_name: str):
        self._ensure_columns(conn, table_name, {
            "label": "INTEGER NOT NULL DEFAULT 0",
            "target_frequency": "REAL DEFAULT 0",
            "trial": "TEXT DEFAULT ''",
            "bp_delta": "REAL NOT NULL DEFAULT 0",
            "bp_theta": "REAL NOT NULL DEFAULT 0",
            "bp_alpha": "REAL NOT NULL DEFAULT 0",
            "bp_beta": "REAL NOT NULL DEFAULT 0",
            "bp_gamma": "REAL NOT NULL DEFAULT 0",
            "rel_delta": "REAL NOT NULL DEFAULT 0",
            "rel_theta": "REAL NOT NULL DEFAULT 0",
            "rel_alpha": "REAL NOT NULL DEFAULT 0",
            "rel_beta": "REAL NOT NULL DEFAULT 0",
            "rel_gamma": "REAL NOT NULL DEFAULT 0",
            "mean": "REAL NOT NULL DEFAULT 0",
            "std": "REAL NOT NULL DEFAULT 0",
            "max": "REAL NOT NULL DEFAULT 0",
            "min": "REAL NOT NULL DEFAULT 0",
            "score_1": "REAL NOT NULL DEFAULT 0",
            "score_2": "REAL NOT NULL DEFAULT 0",
            "score_3": "REAL NOT NULL DEFAULT 0",
            "score_4": "REAL NOT NULL DEFAULT 0",
            "score_5": "REAL NOT NULL DEFAULT 0",
            "score_6": "REAL NOT NULL DEFAULT 0",
            "max_score": "REAL NOT NULL DEFAULT 0",
            "second_max_score": "REAL NOT NULL DEFAULT 0",
            "score_ratio": "REAL NOT NULL DEFAULT 0",
            "score_mean": "REAL NOT NULL DEFAULT 0",
            "score_std": "REAL NOT NULL DEFAULT 0",
            "dominant_freq": "REAL NOT NULL DEFAULT 0",
            "peak_freq": "REAL NOT NULL DEFAULT 0",
            "metadata_json": "TEXT DEFAULT ''",
        })
        cursor = conn.cursor()
        cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_label ON {table_name}(label)')
        cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_trial ON {table_name}(trial)')

    def sanitize_table_name(self, name: str) -> str:
        safe = re.sub(r'[^a-zA-Z0-9]', '_', name)
        return safe.strip('_')

    def _session_metadata_dir(self, sensor_type: str):
        sensor = str(sensor_type).upper()
        path = get_base_data_dir() / sensor / "processed" / "sessions"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _session_metadata_path(self, sensor_type: str, session_name: str):
        sensor = str(sensor_type).upper()
        prefix = f"{sensor.lower()}_session_"
        table_name = session_name if session_name.startswith(prefix) else f"{prefix}{self.sanitize_table_name(session_name)}"
        return self._session_metadata_dir(sensor) / f"{table_name}.json"

    def save_session_metadata(self, sensor_type: str, session_name: str, metadata: Dict):
        try:
            path = self._session_metadata_path(sensor_type, session_name)
            existing = {}
            if path.exists():
                try:
                    existing = json.loads(path.read_text(encoding="utf-8"))
                except Exception:
                    existing = {}
            existing.update(metadata or {})
            path.write_text(json.dumps(existing, indent=2), encoding="utf-8")
            return str(path)
        except Exception as e:
            print(f"Failed to save session metadata for {session_name}: {e}")
            return None

    def get_session_metadata(self, sensor_type: str, session_name: str):
        try:
            path = self._session_metadata_path(sensor_type, session_name)
            if not path.exists():
                return {}
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"Failed to read session metadata for {session_name}: {e}")
            return {}

    def delete_session_metadata(self, sensor_type: str, session_name: str) -> bool:
        try:
            path = self._session_metadata_path(sensor_type, session_name)
            if path.exists():
                path.unlink()
            return True
        except Exception as e:
            print(f"Failed to delete session metadata for {session_name}: {e}")
            return False

    def rename_session_metadata(self, sensor_type: str, old_session_name: str, new_session_name: str) -> bool:
        try:
            old_path = self._session_metadata_path(sensor_type, old_session_name)
            new_path = self._session_metadata_path(sensor_type, new_session_name)
            if not old_path.exists():
                return True
            if new_path.exists():
                new_path.unlink()
            old_path.rename(new_path)
            return True
        except Exception as e:
            print(f"Failed to rename session metadata for {old_session_name}: {e}")
            return False

    def _extract_session_trial_numbers(self, conn, table_name: str, column_name: str) -> List[int]:
        cursor = conn.cursor()
        try:
            cursor.execute(f"SELECT {column_name} FROM {table_name} WHERE {column_name} IS NOT NULL AND {column_name} != ''")
        except Exception:
            return []
        values = []
        for (raw_value,) in cursor.fetchall():
            try:
                values.append(int(str(raw_value), 16))
            except Exception:
                continue
        return values

    def next_trial_id(self, sensor_type: str, session_name: str) -> str:
        sensor = str(sensor_type).upper()
        table_name = session_name if "_session_" in str(session_name) else self.create_session_table(sensor, session_name)
        conn = self.connect(sensor)
        try:
            existing = self._extract_session_trial_numbers(conn, table_name, "trial")
            next_value = max(existing, default=int("AA0DB0", 16)) + 1
            return f"{next_value:06X}"
        finally:
            conn.close()

    def next_serial_id(self, session_name: str) -> int:
        table_name = session_name if str(session_name).startswith("eog_session_") else self.create_session_table("EOG", session_name)
        conn = self.connect("EOG")
        try:
            cursor = conn.cursor()
            cursor.execute(f"SELECT MAX(serial_id) FROM {table_name}")
            row = cursor.fetchone()
            current = int(row[0] or 0)
            return current + 1
        finally:
            conn.close()

    def create_session_table(self, sensor_type: str, session_name: str) -> str:
        sensor = sensor_type.upper()
        safe_suffix = self.sanitize_table_name(session_name)
        if not safe_suffix: safe_suffix = "default"
        
        prefix = f"{sensor.lower()}_session_"
        table_name = f"{prefix}{safe_suffix}"
        
        with self._schema_lock:
            if table_name in self._verified_tables:
                return table_name

            conn = self.connect(sensor)
            cursor = conn.cursor()
            
            if sensor == "EMG":
                self._create_emg_session_table(cursor, table_name)
                self._ensure_emg_session_columns(conn, table_name)
            elif sensor == "EOG":
                self._create_eog_session_table(cursor, table_name)
                self._ensure_eog_session_columns(conn, table_name)
            elif sensor == "EEG":
                self._create_eeg_session_table(cursor, table_name)
                self._ensure_eeg_session_columns(conn, table_name)
                
            conn.commit()
            conn.close()
            self._verified_tables.add(table_name)

        if sensor == "EMG":
            self.save_session_metadata(sensor, table_name, {
                "sensor": sensor,
                "table_name": table_name,
                "storage_format": "compact_emg_v2",
                "feature_columns": COMPACT_EMG_FEATURE_COLUMNS,
            })
        elif sensor == "EEG":
            self.save_session_metadata(sensor, table_name, {
                "sensor": sensor,
                "table_name": table_name,
                "storage_format": "compact_eeg_v1",
            })
        return table_name

    def get_session_tables(self, sensor_type: str) -> List[str]:
        sensor = sensor_type.upper()
        conn = self.connect(sensor)
        cursor = conn.cursor()
        prefix = f"{sensor.lower()}_session_"
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?", (f"{prefix}%",))
        rows = cursor.fetchall()
        conn.close()
        return [r[0] for r in rows]

    # --- Session Management ---
    def delete_session_table(self, sensor_type: str, session_name: str) -> bool:
        """Drop a session table."""
        try:
            # Reconstruct table name logic
            safe_suffix = self.sanitize_table_name(session_name)
            
            sensor = sensor_type.upper()
            prefix = f"{sensor.lower()}_session_"
            
            if session_name.startswith(prefix):
                 table_name = session_name
            else:
                 if not safe_suffix: safe_suffix = "default"
                 table_name = f"{prefix}{safe_suffix}"
            
            conn = self.connect(sensor)
            cursor = conn.cursor()
            cursor.execute(f"DROP TABLE IF EXISTS {table_name}")
            conn.commit()
            conn.close()
            self.delete_session_metadata(sensor, table_name)
            self._verified_tables.discard(table_name)
            print(f"Dropped table: {table_name}")
            return True
        except Exception as e:
            print(f"Error dropping table {session_name}: {e}")
            return False

    def rename_session_table(self, sensor_type: str, old_session_name: str, new_session_name: str) -> bool:
        """Rename a session table."""
        try:
            sensor = sensor_type.upper()
            safe_new_suffix = self.sanitize_table_name(new_session_name)
            if not safe_new_suffix: 
                return False
            
            prefix = f"{sensor.lower()}_session_"
            
            if old_session_name.startswith(prefix):
                 old_table_name = old_session_name
            else:
                 safe_old_suffix = self.sanitize_table_name(old_session_name)
                 if not safe_old_suffix: safe_old_suffix = "default"
                 old_table_name = f"{prefix}{safe_old_suffix}"
            
            new_table_name = f"{prefix}{safe_new_suffix}"
            
            conn = self.connect(sensor)
            cursor = conn.cursor()
            cursor.execute(f"ALTER TABLE {old_table_name} RENAME TO {new_table_name}")
            conn.commit()
            conn.close()
            self.rename_session_metadata(sensor, old_table_name, new_table_name)
            self._verified_tables.discard(old_table_name)
            self._verified_tables.add(new_table_name)
            print(f"Renamed table: {old_table_name} to {new_table_name}")
            return True
        except Exception as e:
            print(f"Error renaming table {old_session_name} to {new_session_name}: {e}")
            return False

    def merge_session_tables(self, sensor_type: str, source_session: str, target_session: str) -> bool:
        """Merge source session into target session, then delete source."""
        return self.merge_multiple_sessions(sensor_type, [source_session], target_session)

    def merge_multiple_sessions(self, sensor_type: str, source_sessions: List[str], target_session: str) -> bool:
        """Merge multiple source sessions into a new target session, then delete sources."""
        try:
            if not source_sessions:
                return False

            sensor = sensor_type.upper()
            prefix = f"{sensor.lower()}_session_"
            
            # Clean target name
            target_clean = target_session.replace(prefix, "") if target_session.startswith(prefix) else target_session
            target_table = f"{prefix}{self.sanitize_table_name(target_clean)}"
            
            tables = self.get_session_tables(sensor)
            # Resolve existing target name if it only differs by case
            for existing in tables:
                if existing.lower() == target_table.lower():
                    target_table = existing
                    break
            
            # Resolve source tables
            source_tables = []
            for src in source_sessions:
                src_table = src if src.startswith(prefix) else f"{prefix}{self.sanitize_table_name(src)}"
                # Use case-insensitive check to avoid merging table into itself
                is_duplicate = any(t.lower() == src_table.lower() for t in [target_table])
                exists = any(t.lower() == src_table.lower() for t in tables)
                
                if exists and not is_duplicate:
                    # Find exact case from tables list
                    exact_src = next(t for t in tables if t.lower() == src_table.lower())
                    source_tables.append(exact_src)
            
            if not source_tables:
                return False
                
            if target_table not in tables:
                self.create_session_table(sensor_type, target_clean)
            
            conn = self.connect(sensor)
            cursor = conn.cursor()
            
            for source_table in source_tables:
                cursor.execute(f"PRAGMA table_info({source_table})")
                source_columns = {col[1] for col in cursor.fetchall() if col[1] != 'id'}
                cursor.execute(f"PRAGMA table_info({target_table})")
                target_columns = {col[1] for col in cursor.fetchall() if col[1] != 'id'}
                columns = [col for col in source_columns if col in target_columns]
                if not columns:
                    continue # Empty or invalid table
                cols_str = ", ".join(columns)
                
                cursor.execute(f"INSERT INTO {target_table} ({cols_str}) SELECT {cols_str} FROM {source_table}")
            
            conn.commit()
            conn.close()
            if sensor == "EMG":
                merged_sources = [self.get_session_metadata(sensor, source_table) for source_table in source_tables]
                self.save_session_metadata(sensor, target_table, {
                    "sensor": sensor,
                    "table_name": target_table,
                    "storage_format": "compact_emg_v1",
                    "feature_columns": COMPACT_EMG_FEATURE_COLUMNS,
                    "merged_from": source_tables,
                    "source_metadata": [meta for meta in merged_sources if meta],
                })
            print(f"Merged tables: {source_tables} into {target_table} (Sources preserved)")
            return True
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"Error merging multiple tables {source_sessions} into {target_session}: {e}")
            return False

    def get_session_data(self, sensor_type: str, session_name: str, limit: int = None, offset: int = 0, 
                         sort_by: str = 'id', order: str = 'ASC', 
                         label_filter: int = None, row_from: int = None, row_to: int = None) -> Dict:
        """Fetch rows from a specific session table with optional pagination, sorting, and filtering."""
        try:
            sensor = sensor_type.upper()
            
            # Validate table name strictly to prevent injection
            prefix = f"{sensor.lower()}_session_"
            if not session_name.startswith(prefix):
                 return {"rows": [], "total": 0}
            
            if session_name not in self.get_session_tables(sensor):
                return {"rows": [], "total": 0}

            conn = self.connect(sensor)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            # Build WHERE clause
            where_clauses = []
            params = []
            if label_filter is not None:
                where_clauses.append("label = ?")
                params.append(label_filter)
            if row_from is not None:
                where_clauses.append("id >= ?")
                params.append(row_from)
            if row_to is not None:
                where_clauses.append("id <= ?")
                params.append(row_to)
            
            where_stmt = ""
            if where_clauses:
                where_stmt = " WHERE " + " AND ".join(where_clauses)

            # Get total count with filters
            cursor.execute(f"SELECT COUNT(*) FROM {session_name}{where_stmt}", params)
            total_filtered = cursor.fetchone()[0]

            # Get absolute total count
            cursor.execute(f"SELECT COUNT(*) FROM {session_name}")
            absolute_total = cursor.fetchone()[0]

            # Fetch paginated data
            # Validate sort_by
            allowed_sort = {'id', 'label', 'timestamp', 'created_at'}
            if sort_by not in allowed_sort:
                sort_by = 'id'
            
            order = 'DESC' if order.upper() == 'DESC' else 'ASC'
            
            query = f"SELECT * FROM {session_name}{where_stmt} ORDER BY {sort_by} {order}"
            
            if limit is not None:
                query += " LIMIT ? OFFSET ?"
                fetch_params = params + [limit, offset]
            else:
                fetch_params = params
            
            cursor.execute(query, fetch_params)
            rows = cursor.fetchall()
            
            results = []
            for row in rows:
                r_dict = dict(row)
                item = {
                    "id": r_dict.get('id'),
                    "label": r_dict.get('label'),
                    "timestamp": r_dict.get('timestamp')
                }
                
                # Collect remaining columns as features for display
                excluded = {
                    'id', 'label', 'session_id', 'timestamp', 'created_at', 'metadata_json',
                    'confidence', 'source', 'corrected_label'
                }
                features = {k: v for k, v in r_dict.items() if k not in excluded}
                if sensor == "EMG" and 'trial' in features:
                    ordered_features = {'trial': features.pop('trial')}
                    ordered_features.update(features)
                    features = ordered_features
                elif sensor == "EOG" and 'serial_id' in features:
                    ordered_features = {'serial_id': features.pop('serial_id')}
                    ordered_features.update(features)
                    features = ordered_features
                elif sensor == "EEG":
                    ordered_features = {}
                    for key in ('target_frequency', 'trial'):
                        if key in features:
                            ordered_features[key] = features.pop(key)
                    ordered_features.update(features)
                    features = ordered_features
                
                item['features'] = features
                results.append(item)
                
            conn.close()
            return {
                "rows": results,
                "total": total_filtered,
                "absolute_total": absolute_total,
                "session_metadata": self.get_session_metadata(sensor, session_name),
            }
        except Exception as e:
            print(f"Error fetching session data {session_name}: {e}")
            return {"rows": [], "total": 0, "absolute_total": 0}

    def delete_session_row(self, sensor_type: str, session_name: str, row_id: int) -> bool:
        """Delete a specific row from a session table and shift subsequent IDs."""
        try:
            sensor = sensor_type.upper()
            prefix = f"{sensor.lower()}_session_"
            if not session_name.startswith(prefix):
                 if session_name not in self.get_session_tables(sensor):
                     return False

            conn = self.connect(sensor)
            cursor = conn.cursor()
            
            # Start transaction
            cursor.execute("BEGIN TRANSACTION")
            
            # Delete the row
            cursor.execute(f"DELETE FROM {session_name} WHERE id = ?", (row_id,))
            
            # Shift IDs to fill the gap (only if a row was actually deleted)
            if cursor.rowcount > 0:
                cursor.execute(f"UPDATE {session_name} SET id = id - 1 WHERE id > ?", (row_id,))
                # Reset AUTOINCREMENT sequence if needed
                cursor.execute(f"UPDATE sqlite_sequence SET seq = (SELECT MAX(id) FROM {session_name}) WHERE name = ?", (session_name,))
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"Error deleting row {row_id} from {session_name}: {e}")
            return False

    def delete_session_trial(self, sensor_type: str, session_name: str, trial_id: str) -> bool:
        """Delete all rows for a trial and re-index IDs later (outside of active recording)."""
        try:
            sensor = sensor_type.upper()
            prefix = f"{sensor.lower()}_session_"
            if not session_name.startswith(prefix):
                 if session_name not in self.get_session_tables(sensor):
                     return False

            conn = self.connect(sensor)
            cursor = conn.cursor()
            
            cursor.execute(f"DELETE FROM {session_name} WHERE trial = ?", (trial_id,))
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"Error deleting trial {trial_id} from {session_name}: {e}")
            return False

    def id_reindex(self, sensor_type: str, session_name: str) -> bool:
        """Fully re-index the id column to be contiguous 1, 2, 3... N."""
        try:
            sensor = sensor_type.upper()
            prefix = f"{sensor.lower()}_session_"
            if not session_name.startswith(prefix):
                 if session_name not in self.get_session_tables(sensor):
                     return False

            conn = self.connect(sensor)
            cursor = conn.cursor()
            
            cursor.execute("BEGIN TRANSACTION")
            
            # Create a temporary table with the correct order
            cursor.execute(f"CREATE TEMPORARY TABLE {session_name}_temp AS SELECT * FROM {session_name} ORDER BY id")
            cursor.execute(f"DELETE FROM {session_name}")
            
            # Get columns except 'id'
            cursor.execute(f"PRAGMA table_info({session_name}_temp)")
            cols = [row[1] for row in cursor.fetchall() if row[1] != 'id']
            cols_str = ", ".join(cols)
            
            # Insert back into original table (id will be regenerated contiguous 1..N)
            cursor.execute(f"INSERT INTO {session_name} ({cols_str}) SELECT {cols_str} FROM {session_name}_temp ORDER BY rowid")
            
            cursor.execute(f"DROP TABLE {session_name}_temp")
            
            # Reset sequence
            cursor.execute(f"UPDATE sqlite_sequence SET seq = (SELECT COUNT(*) FROM {session_name}) WHERE name = ?", (session_name,))
            
            conn.commit()
            conn.close()
            print(f"Re-indexed IDs for {session_name}")
            return True
        except Exception as e:
            print(f"Error re-indexing {session_name}: {e}")
            return False
            conn.commit()
            conn.close()
            
            if rows_affected > 0:
                print(f"Deleted row {row_id} from {session_name}")
                return True
            else:
                print(f"Row {row_id} not found in {session_name}")
                return False
                

    # --- EMG Methods ---
    def insert_emg_window(self, features: Dict[str, float], label: int, session_id: str = None, table_name: str = "emg_windows") -> bool:
        try:
            conn = self.connect('EMG')
            if table_name.startswith("emg_session_"):
                self._ensure_emg_session_columns(conn, table_name)
            else:
                self._ensure_emg_columns(conn, table_name)
            cursor = conn.cursor()
            
            trial = features.get('trial', '')
            
            # Session storage uses different column set
            if table_name.startswith("emg_session_"):
                values = (
                    label,
                    trial,
                    features.get('mav', 0), features.get('rms', 0), features.get('iemg', 0),
                    features.get('var', 0), features.get('wl', 0), features.get('zc', 0),
                    features.get('ssc', 0), features.get('mean_freq', 0),
                    features.get('median_freq', 0), features.get('spectral_entropy', 0),
                    features.get('d_mav', 0), features.get('d_rms', 0), features.get('d_iemg', 0),
                    features.get('d_var', 0), features.get('d_wl', 0), features.get('d_zc', 0),
                    features.get('d_ssc', 0), features.get('d_mean_freq', 0),
                    features.get('d_median_freq', 0), features.get('d_spectral_entropy', 0),
                    self._serialize_metadata(features.get('metadata_json', features.get('metadata', {}))),
                    features.get('source', 'manual'),
                    session_id,
                    features.get('timestamp', 0)
                )
                cursor.execute(f'''
                    INSERT INTO {table_name} (
                        label, trial,
                        mav, rms, iemg, var, wl, zc, ssc, mean_freq, median_freq, spectral_entropy,
                        d_mav, d_rms, d_iemg, d_var, d_wl, d_zc, d_ssc, d_mean_freq, d_median_freq, d_spectral_entropy,
                        metadata_json, source, session_id, timestamp
                    ) VALUES ({", ".join(["?"] * len(values))})
                ''', values)
            else:
                values = (
                    label, trial,
                    features.get('rms', 0), features.get('mav', 0),
                    features.get('var', 0), features.get('wl', 0), features.get('peak', 0),
                    features.get('range', 0), features.get('iemg', 0), features.get('entropy', 0),
                    features.get('energy', 0), features.get('kurtosis', 0), features.get('skewness', 0),
                    features.get('ssc', 0), features.get('wamp', 0),
                    features.get('zc', 0), features.get('mean_freq', 0),
                    features.get('median_freq', 0), features.get('spectral_entropy', 0),
                    features.get('d_mav', 0), features.get('d_rms', 0), features.get('d_iemg', 0),
                    features.get('d_var', 0), features.get('d_wl', 0), features.get('d_zc', 0),
                    features.get('d_ssc', 0), features.get('d_mean_freq', 0),
                    features.get('d_median_freq', 0), features.get('d_spectral_entropy', 0),
                    int(features.get('channel_index', 0) or 0),
                    int(features.get('sample_count', 0) or 0),
                    float(features.get('window_ms', 0) or 0),
                    float(features.get('capture_window_ms', 0) or 0),
                    float(features.get('sampling_rate', 0) or 0),
                    float(features.get('session_window_ms', 0) or 0),
                    float(features.get('session_overlap', 0) or 0),
                    float(features.get('session_stride_ms', 0) or 0),
                    float(features.get('gap_ms', 0) or 0),
                    self._serialize_metadata(features.get('metadata_json', features.get('metadata', {}))),
                    features.get('confidence', 0), features.get('source', 'manual'),
                    features.get('corrected_label'),
                    session_id, features.get('timestamp', 0)
                )
                cursor.execute(f'''
                    INSERT INTO {table_name} (
                        label, trial,
                        rms, mav, var, wl, peak, range, iemg, entropy, energy, kurtosis, skewness, ssc, wamp,
                        zc, mean_freq, median_freq, spectral_entropy,
                        d_mav, d_rms, d_iemg, d_var, d_wl, d_zc, d_ssc, d_mean_freq, d_median_freq, d_spectral_entropy,
                        channel_index, sample_count, window_ms, capture_window_ms, sampling_rate, session_window_ms, session_overlap, session_stride_ms, gap_ms, metadata_json,
                        confidence, source, corrected_label,
                        session_id, timestamp
                    ) VALUES ({", ".join(["?"] * len(values))})
                ''', values)
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"EMG Insert Error: {e}")
            return False

    def _serialize_metadata(self, metadata):
        if isinstance(metadata, str):
            return metadata
        if metadata is None:
            return ''
        try:
            return json.dumps(metadata)
        except Exception:
            return ''

    def get_counts_by_label(self, table_name: str = "emg_windows") -> Dict[str, int]:
        try:
            conn = self.connect('EMG')
            cursor = conn.cursor()
            cursor.execute(f'SELECT label, COUNT(*) FROM {table_name} GROUP BY label')
            rows = cursor.fetchall()
            counts = { "0": 0, "1": 0, "2": 0, "3": 0 }
            for l, c in rows: counts[str(l)] = c
            conn.close()
            return counts
        except: return { "0": 0, "1": 0, "2": 0, "3": 0 }

    def insert_window(self, features: Dict[str, float], label: int, session_id: str = None, table_name: str = "emg_windows") -> bool:
        return self.insert_emg_window(features, label, session_id=session_id, table_name=table_name)
        
    def clear_table(self, sensor_type: str, table_name: str):
        try:
            conn = self.connect(sensor_type)
            cursor = conn.cursor()
            cursor.execute(f'DELETE FROM {table_name}')
            conn.commit()
            conn.close()
            return {"status": "success"}
        except Exception as e:
            return {"error": str(e)}

    # --- EOG Methods ---
    def insert_eog_window(self, features: Dict[str, float], label: int, session_id: str = None, table_name: str = "eog_windows") -> bool:
        try:
            conn = self.connect('EOG')
            if table_name.startswith("eog_session_"):
                self._ensure_eog_session_columns(conn, table_name)
            else:
                self._ensure_eog_columns(conn, table_name)
            cursor = conn.cursor()
            
            raw_serial_id = features.get('serial_id', 0)
            try:
                serial_id = int(float(raw_serial_id))
            except (TypeError, ValueError):
                serial_id = 0
            if table_name.startswith("eog_session_"):
                cursor.execute(f'''
                    INSERT INTO {table_name} (
                        label, serial_id,
                        amplitude, duration_ms, rise_time_ms, fall_time_ms,
                        asymmetry, peak_count, kurtosis, skewness,
                        source, session_id, timestamp
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    label, serial_id,
                    features.get('amplitude', 0), features.get('duration_ms', 0), features.get('rise_time_ms', 0),
                    features.get('fall_time_ms', 0), features.get('asymmetry', 0), int(features.get('peak_count', 0)),
                    features.get('kurtosis', 0), features.get('skewness', 0),
                    features.get('source', 'manual'),
                    session_id, features.get('timestamp', 0)
                ))
            else:
                cursor.execute(f'''
                    INSERT INTO {table_name} (
                        label, serial_id,
                        amplitude, duration_ms, rise_time_ms, fall_time_ms, 
                        asymmetry, peak_count, kurtosis, skewness,
                        confidence, source, corrected_label,
                        session_id, timestamp
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    label, serial_id,
                    features.get('amplitude', 0), features.get('duration_ms', 0), features.get('rise_time_ms', 0),
                    features.get('fall_time_ms', 0), features.get('asymmetry', 0), int(features.get('peak_count', 0)),
                    features.get('kurtosis', 0), features.get('skewness', 0),
                    features.get('confidence', 0), features.get('source', 'manual'),
                    features.get('corrected_label'),
                    session_id, features.get('timestamp', 0)
                ))
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"EOG Insert Error: {e}")
            return False

    def get_eog_counts(self, table_name: str = "eog_windows") -> Dict[str, int]:
        try:
            conn = self.connect('EOG')
            cursor = conn.cursor()
            cursor.execute(f'SELECT label, COUNT(*) FROM {table_name} GROUP BY label')
            rows = cursor.fetchall()
            counts = {"0": 0, "1": 0, "2": 0}
            for l, c in rows: counts[str(l)] = c
            conn.close()
            return counts
        except: return {"0": 0, "1": 0, "2": 0}

    # --- EEG Methods ---
    def insert_eeg_window(self, features: Dict[str, float], label: Any, session_id: str = None, table_name: str = "eeg_windows") -> bool:
        try:
            conn = self.connect('EEG')
            if table_name.startswith("eeg_session_"):
                self._ensure_eeg_session_columns(conn, table_name)
            else:
                self._ensure_eeg_columns(conn, table_name)
            cursor = conn.cursor()
            
            trial = features.get('trial', '')
            target_freq = float(features.get('target_frequency', 0) or 0)
            if table_name.startswith("eeg_session_"):
                cursor.execute(f'''
                    INSERT INTO {table_name} (
                        label, target_frequency, trial,
                        bp_delta, bp_theta, bp_alpha, bp_beta, bp_gamma,
                        rel_delta, rel_theta, rel_alpha, rel_beta, rel_gamma,
                        mean, std, max, min,
                        score_1, score_2, score_3, score_4, score_5, score_6,
                        max_score, second_max_score, score_ratio, score_mean, score_std, dominant_freq, peak_freq,
                        metadata_json, session_id, timestamp
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    label, target_freq, trial,
                    features.get('bp_delta', 0), features.get('bp_theta', 0),
                    features.get('bp_alpha', 0), features.get('bp_beta', 0),
                    features.get('bp_gamma', 0), features.get('rel_delta', 0),
                    features.get('rel_theta', 0), features.get('rel_alpha', 0),
                    features.get('rel_beta', 0), features.get('rel_gamma', 0),
                    features.get('mean', 0), features.get('std', 0),
                    features.get('max', 0), features.get('min', 0),
                    features.get('score_1', 0), features.get('score_2', 0),
                    features.get('score_3', 0), features.get('score_4', 0),
                    features.get('score_5', 0), features.get('score_6', 0),
                    features.get('max_score', 0), features.get('second_max_score', 0),
                    features.get('score_ratio', 0), features.get('score_mean', 0),
                    features.get('score_std', 0), features.get('dominant_freq', 0),
                    features.get('peak_freq', 0),
                    self._serialize_metadata(features.get('metadata_json', features.get('metadata', {}))),
                    session_id, features.get('timestamp', 0)
                ))
            else:
                cursor.execute(f'''
                    INSERT INTO {table_name} (
                        label, trial, target_frequency,
                        bp_delta, bp_theta, bp_alpha, bp_beta, bp_gamma,
                        rel_delta, rel_theta, rel_alpha, rel_beta, rel_gamma,
                        mean, std, max, min,
                        score_1, score_2, score_3, score_4, score_5, score_6,
                        max_score, second_max_score, score_ratio, score_mean, score_std, dominant_freq, peak_freq,
                        channel_index, sample_count, window_ms, metadata_json,
                        session_id, timestamp
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    label, trial, target_freq,
                    features.get('bp_delta', 0), features.get('bp_theta', 0),
                    features.get('bp_alpha', 0), features.get('bp_beta', 0),
                    features.get('bp_gamma', 0), features.get('rel_delta', 0),
                    features.get('rel_theta', 0), features.get('rel_alpha', 0),
                    features.get('rel_beta', 0), features.get('rel_gamma', 0),
                    features.get('mean', 0), features.get('std', 0),
                    features.get('max', 0), features.get('min', 0),
                    features.get('score_1', 0), features.get('score_2', 0),
                    features.get('score_3', 0), features.get('score_4', 0),
                    features.get('score_5', 0), features.get('score_6', 0),
                    features.get('max_score', 0), features.get('second_max_score', 0),
                    features.get('score_ratio', 0), features.get('score_mean', 0),
                    features.get('score_std', 0), features.get('dominant_freq', 0),
                    features.get('peak_freq', 0),
                    features.get('channel_index', 0),
                    features.get('sample_count', 0), features.get('window_ms', 0),
                    self._serialize_metadata(features.get('metadata_json', features.get('metadata', {}))),
                    session_id, features.get('timestamp', 0)
                ))
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"EEG Insert Error: {e}")
            return False

    def get_eeg_counts(self, table_name: str = "eeg_windows") -> Dict[str, int]:
        try:
            conn = self.connect('EEG')
            cursor = conn.cursor()
            cursor.execute(f'SELECT label, COUNT(*) FROM {table_name} GROUP BY label')
            rows = cursor.fetchall()
            counts = {"0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0}
            for l, c in rows: counts[str(l)] = c
            conn.close()
            return counts
        except: return {"0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0}

db_manager = DatabaseManager()
