
import sqlite3
import re
from pathlib import Path
from typing import Dict, Optional, List

class DatabaseManager:
    def __init__(self):
        project_root = Path(__file__).resolve().parent.parent.parent
        base_data_dir = project_root / "frontend" / "public" / "data"
        
        self.db_paths = {
            'EMG': base_data_dir / "EMG" / "processed" / "emg_data.db",
            'EOG': base_data_dir / "EOG" / "processed" / "eog_data.db",
            'EEG': base_data_dir / "EEG" / "processed" / "eeg_data.db"
        }
        
        # Ensure directories exist
        for path in self.db_paths.values():
            path.parent.mkdir(parents=True, exist_ok=True)
        
        self._init_dbs()
        
    def connect(self, sensor_type: str):
        """Get database connection for specific sensor."""
        sensor = sensor_type.upper()
        if sensor not in self.db_paths:
            raise ValueError(f"Unknown sensor type: {sensor}")
        conn = sqlite3.connect(self.db_paths[sensor])
        # Enable Write-Ahead Logging (WAL) for better concurrency
        conn.execute("PRAGMA journal_mode=WAL;")
        return conn

    def _init_dbs(self):
        """Initialize all databases."""
        # EMG
        conn = self.connect('EMG')
        self._create_emg_table(conn.cursor(), "emg_windows")
        conn.commit()
        conn.close()

        # EOG
        conn = self.connect('EOG')
        self._create_eog_table(conn.cursor(), "eog_windows")
        conn.commit()
        conn.close()

        # EEG
        conn = self.connect('EEG')
        self._create_eeg_table(conn.cursor(), "eeg_windows")
        conn.commit()
        conn.close()

    def _create_emg_table(self, cursor, table_name):
        cursor.execute(f'''
            CREATE TABLE IF NOT EXISTS {table_name} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
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
                label INTEGER NOT NULL,
                session_id TEXT,
                timestamp REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_label ON {table_name}(label)')

    def _create_eog_table(self, cursor, table_name):
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
                label INTEGER NOT NULL,
                session_id TEXT,
                timestamp REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_label ON {table_name}(label)')

    def _create_eeg_table(self, cursor, table_name):
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
                label INTEGER NOT NULL,
                session_id TEXT,
                timestamp REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_label ON {table_name}(label)')

    def sanitize_table_name(self, name: str) -> str:
        safe = re.sub(r'[^a-zA-Z0-9]', '_', name)
        return safe.strip('_')

    def create_session_table(self, sensor_type: str, session_name: str) -> str:
        safe_suffix = self.sanitize_table_name(session_name)
        if not safe_suffix: safe_suffix = "default"
        
        sensor = sensor_type.upper()
        table_name = f"{sensor.lower()}_session_{safe_suffix}"
        
        conn = self.connect(sensor)
        cursor = conn.cursor()
        
        if sensor == "EMG":
            self._create_emg_table(cursor, table_name)
        elif sensor == "EOG":
            self._create_eog_table(cursor, table_name)
        elif sensor == "EEG":
            self._create_eeg_table(cursor, table_name)
            
        conn.commit()
        conn.close()
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
            print(f"[DB] Dropped table: {table_name}")
            return True
        except Exception as e:
            print(f"[DB] Error dropping table {session_name}: {e}")
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
            print(f"[DB] Renamed table: {old_table_name} to {new_table_name}")
            return True
        except Exception as e:
            print(f"[DB] Error renaming table {old_session_name} to {new_session_name}: {e}")
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
            
            # Resolve source tables
            source_tables = []
            for src in source_sessions:
                src_table = src if src.startswith(prefix) else f"{prefix}{self.sanitize_table_name(src)}"
                if src_table in tables and src_table != target_table:
                    source_tables.append(src_table)
            
            if not source_tables:
                return False
                
            if target_table not in tables:
                self.create_session_table(sensor_type, target_clean)
            
            conn = self.connect(sensor)
            cursor = conn.cursor()
            
            for source_table in source_tables:
                # Fetch column names from source to ensure we only insert matching columns
                cursor.execute(f"PRAGMA table_info({source_table})")
                columns = [col[1] for col in cursor.fetchall() if col[1] != 'id'] # exclude id to let it auto-increment
                if not columns:
                    continue # Empty or invalid table
                cols_str = ", ".join(columns)
                
                cursor.execute(f"INSERT INTO {target_table} ({cols_str}) SELECT {cols_str} FROM {source_table}")
            
            conn.commit()
            conn.close()
            print(f"[DB] Merged tables: {source_tables} into {target_table} (Sources preserved)")
            return True
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"[DB] Error merging multiple tables {source_sessions} into {target_session}: {e}")
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
                excluded = {'id', 'label', 'session_id', 'timestamp', 'created_at'}
                features = {k: v for k, v in r_dict.items() if k not in excluded}
                
                item['features'] = features
                results.append(item)
                
            conn.close()
            return {"rows": results, "total": total_filtered, "absolute_total": absolute_total}
        except Exception as e:
            print(f"[DB] Error fetching session data {session_name}: {e}")
            return {"rows": [], "total": 0, "absolute_total": 0}

    def delete_session_row(self, sensor_type: str, session_name: str, row_id: int) -> bool:
        """Delete a specific row from a session table."""
        try:
            sensor = sensor_type.upper()
            
            # Validate table name similar to get_session_data
            prefix = f"{sensor.lower()}_session_"
            if not session_name.startswith(prefix):
                 # Try sanitize/lookup if needed, but stick to strict matching for safety like get_session_data
                 # Or allow if it's in the known table list (expensive?)
                 # For now, strict prefix check as frontend sends full name
                 if session_name not in self.get_session_tables(sensor):
                     return False

            conn = self.connect(sensor)
            cursor = conn.cursor()
            
            # Use parameterized query for ID, but table name must be injected (safe due to check above)
            cursor.execute(f"DELETE FROM {session_name} WHERE id = ?", (row_id,))
            
            rows_affected = cursor.rowcount
            conn.commit()
            conn.close()
            
            if rows_affected > 0:
                print(f"[DB] Deleted row {row_id} from {session_name}")
                return True
            else:
                print(f"[DB] Row {row_id} not found in {session_name}")
                return False
                
        except Exception as e:
            print(f"[DB] Error deleting row {row_id} from {session_name}: {e}")
            return False

    # --- EMG Methods ---
    def insert_window(self, features: Dict[str, float], label: int, session_id: str = None, table_name: str = "emg_windows") -> bool:
        try:
            conn = self.connect('EMG')
            cursor = conn.cursor()
            cursor.execute(f'''
                INSERT INTO {table_name} (
                    rms, mav, var, wl, peak, range, iemg, entropy, energy, kurtosis, skewness, ssc, wamp,
                    label, session_id, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                features.get('rms', 0), features.get('mav', 0),
                features.get('var', 0), features.get('wl', 0), features.get('peak', 0),
                features.get('range', 0), features.get('iemg', 0), features.get('entropy', 0),
                features.get('energy', 0), features.get('kurtosis', 0), features.get('skewness', 0),
                features.get('ssc', 0), features.get('wamp', 0),
                label, session_id, features.get('timestamp', 0)
            ))
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"[DB] EMG Insert Error: {e}")
            return False

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
            cursor = conn.cursor()
            cursor.execute(f'''
                INSERT INTO {table_name} (
                    amplitude, duration_ms, rise_time_ms, fall_time_ms, 
                    asymmetry, peak_count, kurtosis, skewness,
                    label, session_id, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                features.get('amplitude', 0), features.get('duration_ms', 0), features.get('rise_time_ms', 0),
                features.get('fall_time_ms', 0), features.get('asymmetry', 0), int(features.get('peak_count', 0)),
                features.get('kurtosis', 0), features.get('skewness', 0), label, session_id, features.get('timestamp', 0)
            ))
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"[DB] EOG Insert Error: {e}")
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
    def insert_eeg_window(self, features: Dict[str, float], label: int, session_id: str = None, table_name: str = "eeg_windows") -> bool:
        try:
            conn = self.connect('EEG')
            cursor = conn.cursor()
            cursor.execute(f'''
                INSERT INTO {table_name} (
                    bp_delta, bp_theta, bp_alpha, bp_beta, bp_gamma,
                    rel_delta, rel_theta, rel_alpha, rel_beta, rel_gamma,
                    mean, std, max, min,
                    label, session_id, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                features.get('bp_delta', 0), features.get('bp_theta', 0),
                features.get('bp_alpha', 0), features.get('bp_beta', 0),
                features.get('bp_gamma', 0), features.get('rel_delta', 0),
                features.get('rel_theta', 0), features.get('rel_alpha', 0),
                features.get('rel_beta', 0), features.get('rel_gamma', 0),
                features.get('mean', 0), features.get('std', 0),
                features.get('max', 0), features.get('min', 0),
                label, session_id, features.get('timestamp', 0)
            ))
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"[DB] EEG Insert Error: {e}")
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
