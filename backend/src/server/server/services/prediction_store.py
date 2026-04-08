import json
import sqlite3
import time

from src.utils.paths import get_base_data_dir


PREDICTION_DB_DIR = get_base_data_dir() / "PREDICTION" / "EMG"
PREDICTION_DB_PATH = PREDICTION_DB_DIR / "emg.db"


def get_db_connection():
    PREDICTION_DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(PREDICTION_DB_PATH), timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def initialize_prediction_store():
    conn = get_db_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp REAL,
                ground_truth TEXT,
                predicted_label TEXT,
                confidence REAL,
                features TEXT
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def insert_prediction(label, predicted_label, confidence, features):
    conn = get_db_connection()
    try:
        conn.execute(
            "INSERT INTO predictions (timestamp, ground_truth, predicted_label, confidence, features) VALUES (?, ?, ?, ?, ?)",
            (time.time(), label, predicted_label, confidence, json.dumps(features)),
        )
        conn.commit()
    finally:
        conn.close()


def list_predictions(limit=1000):
    conn = get_db_connection()
    try:
        rows = conn.execute("SELECT * FROM predictions ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    finally:
        conn.close()

    result = []
    for row in rows:
        result.append(
            {
                "id": row["id"],
                "timestamp": row["timestamp"],
                "label": row["ground_truth"],
                "class": row["predicted_label"],
                "predicted_label": row["predicted_label"],
                "confidence": row["confidence"],
                "features": json.loads(row["features"]) if row["features"] else {},
            }
        )
    return result


def delete_prediction_row(row_id):
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM predictions WHERE id = ?", (row_id,))
        conn.commit()
    finally:
        conn.close()


def clear_predictions():
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM predictions")
        conn.commit()
    finally:
        conn.close()
