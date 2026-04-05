import csv
import json
import os
import time
from pathlib import Path

from src.utils.paths import get_base_data_dir


BASE_DATA_DIR = get_base_data_dir()
BASE_AUDIO_DIR = BASE_DATA_DIR / "audio"
ALLOWED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg"}


def ensure_audio_dir():
    BASE_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    return BASE_AUDIO_DIR


def allowed_audio_file(filename):
    return Path(filename).suffix.lower() in ALLOWED_AUDIO_EXTENSIONS


def save_recording_session(data):
    if not data or "filename" not in data or "payload" not in data:
        return {"error": "Invalid request payload"}, 400

    filename = data["filename"]
    payload = data["payload"]
    sensor_type = data.get("sensor_type", "recordings")

    safe_filename = os.path.basename(filename)
    if not safe_filename.endswith(".csv"):
        if safe_filename.endswith(".json"):
            safe_filename = safe_filename[:-5] + ".csv"
        else:
            safe_filename += ".csv"

    target_dir = BASE_DATA_DIR / ("recordings" if sensor_type == "recordings" else f"{sensor_type}/recordings")
    target_dir.mkdir(parents=True, exist_ok=True)
    filepath = target_dir / safe_filename

    metadata = payload.get("metadata", {})
    records = payload.get("data", [])

    with open(filepath, "w", newline="") as file_obj:
        file_obj.write(f"# METADATA: {json.dumps(metadata)}\n")
        if records:
            all_channels = set()
            for record in records:
                if "channels" in record:
                    all_channels.update(record["channels"].keys())
            channel_keys = sorted(list(all_channels))

            writer = csv.writer(file_obj)
            writer.writerow(["timestamp", *channel_keys])
            for record in records:
                row = [record.get("timestamp", "")]
                for channel_key in channel_keys:
                    row.append(record.get("channels", {}).get(channel_key, ""))
                writer.writerow(row)

    return {"status": "success", "message": f"Session saved to {safe_filename}", "path": str(filepath)}


def list_recordings():
    if not BASE_DATA_DIR.exists():
        return []

    recordings = []
    for file in BASE_DATA_DIR.glob("**/recordings/*.csv"):
        stat = file.stat()
        sensor = file.parent.parent.name if file.parent.parent != BASE_DATA_DIR else "General"
        recordings.append(
            {
                "name": file.name,
                "size": stat.st_size,
                "created": stat.st_ctime,
                "sensor": sensor,
                "type": file.name.split("__")[0],
                "path": str(file.relative_to(BASE_DATA_DIR)).replace("\\", "/"),
            }
        )

    legacy_dir = BASE_DATA_DIR / "recordings"
    if legacy_dir.exists():
        for file in legacy_dir.glob("*.csv"):
            if any(record["name"] == file.name for record in recordings):
                continue
            stat = file.stat()
            recordings.append(
                {
                    "name": file.name,
                    "size": stat.st_size,
                    "created": stat.st_ctime,
                    "sensor": "General",
                    "type": file.name.split("__")[0],
                    "path": str(file.relative_to(BASE_DATA_DIR)).replace("\\", "/"),
                }
            )

    recordings.sort(key=lambda item: item["created"], reverse=True)
    return recordings


def load_recording(filepath):
    if ".." in filepath:
        return {"error": "Invalid path"}, 400

    full_path = BASE_DATA_DIR / filepath
    if not full_path.exists():
        return {"error": f"Recording not found at {filepath}"}, 404

    if full_path.suffix.lower() == ".csv":
        data = {"metadata": {}, "data": []}
        with open(full_path, "r", newline="") as file_obj:
            first_line = file_obj.readline()
            if first_line.startswith("# METADATA: "):
                try:
                    data["metadata"] = json.loads(first_line[len("# METADATA: ") :].strip())
                except Exception:
                    pass
            else:
                file_obj.seek(0)

            reader = csv.reader(file_obj)
            header = next(reader, None)
            if header and header[0] == "timestamp":
                channel_keys = header[1:]
                for row in reader:
                    if not row:
                        continue
                    record = {"timestamp": float(row[0]) if row[0] else 0.0, "channels": {}}
                    for index, channel_key in enumerate(channel_keys):
                        if index + 1 < len(row):
                            try:
                                record["channels"][channel_key] = float(row[index + 1])
                            except ValueError:
                                record["channels"][channel_key] = row[index + 1]
                    data["data"].append(record)
        return data

    with open(full_path, "r") as file_obj:
        return json.load(file_obj)


def list_audio_tracks():
    ensure_audio_dir()
    tracks = []
    for file in BASE_AUDIO_DIR.iterdir():
        if file.is_file() and allowed_audio_file(file.name):
            stat = file.stat()
            tracks.append(
                {
                    "name": file.name,
                    "size": stat.st_size,
                    "created": stat.st_ctime,
                    "url": f"/data/audio/{file.name}",
                }
            )
    tracks.sort(key=lambda item: item["created"], reverse=True)
    return tracks


def save_audio_track(uploaded_file):
    ensure_audio_dir()
    if not uploaded_file or not uploaded_file.filename:
        return {"error": "No selected file"}, 400
    if not allowed_audio_file(uploaded_file.filename):
        return {"error": "File type not allowed"}, 400

    filename = Path(uploaded_file.filename).name
    filepath = BASE_AUDIO_DIR / filename
    if filepath.exists():
        filename = f"{Path(filename).stem}_{int(time.time())}{Path(filename).suffix}"
        filepath = BASE_AUDIO_DIR / filename
    uploaded_file.save(str(filepath))
    return {
        "status": "success",
        "message": f"Track uploaded: {filename}",
        "track": {"name": filename, "url": f"/data/audio/{filename}"},
    }


def resolve_audio_path(filename):
    if ".." in filename or filename.startswith("/"):
        return {"error": "Invalid filename"}, 400
    filepath = (BASE_AUDIO_DIR / filename).resolve()
    if not filepath.exists():
        return {"error": f"Track '{filename}' not found"}, 404
    return filepath


def delete_audio_track(filename):
    safe_filename = Path(filename).name
    filepath = BASE_AUDIO_DIR / safe_filename
    if not filepath.exists():
        return {"error": "Track not found"}, 404
    filepath.unlink()
    return {"status": "success", "message": f"Track deleted: {safe_filename}"}
