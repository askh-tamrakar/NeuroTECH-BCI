from flask import Blueprint, jsonify, request
from pathlib import Path
import json
import csv
import os

recording_bp = Blueprint('recording', __name__)

# Paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
BASE_DATA_DIR = PROJECT_ROOT / "frontend" / "public" / "data"

@recording_bp.route('/api/record', methods=['POST'])
def api_record_session():
    """Save a recorded session to disk."""
    try:
        data = request.get_json()
        if not data or 'filename' not in data or 'payload' not in data:
            return jsonify({"error": "Invalid request payload"}), 400

        filename = data['filename']
        payload = data['payload']
        sensor_type = data.get('sensor_type', 'recordings') # Default to recordings if not specified

        # Path protection: ensure filename is safe
        safe_filename = os.path.basename(filename)
        if not safe_filename.endswith('.csv'):
            if safe_filename.endswith('.json'):
                safe_filename = safe_filename[:-5] + '.csv'
            else:
                safe_filename += '.csv'

        # Target directory: data/<sensor_type>/recordings/
        # If sensor_type is just 'recordings', stay in data/recordings/
        if sensor_type == 'recordings':
            target_dir = BASE_DATA_DIR / "recordings"
        else:
            target_dir = BASE_DATA_DIR / sensor_type / "recordings"
            
        target_dir.mkdir(parents=True, exist_ok=True)
        
        filepath = target_dir / safe_filename

        metadata = payload.get('metadata', {})
        records = payload.get('data', [])

        with open(filepath, 'w', newline='') as f:
            # Write metadata as json string commented out
            f.write(f"# METADATA: {json.dumps(metadata)}\n")
            
            if not records:
                # No data to write
                pass
            else:
                # Determine channels from first row or metadata
                all_channels = set()
                for r in records:
                    if 'channels' in r:
                        all_channels.update(r['channels'].keys())
                channel_keys = sorted(list(all_channels))
                
                writer = csv.writer(f)
                header = ['timestamp'] + channel_keys
                writer.writerow(header)
                
                for r in records:
                    row = [r.get('timestamp', '')]
                    for ck in channel_keys:
                        row.append(r.get('channels', {}).get(ck, ''))
                    writer.writerow(row)

        print(f"[Recording_Routes] 💾 Session saved: {filepath}")
        return jsonify({
            "status": "success",
            "message": f"Session saved to {safe_filename}",
            "path": str(filepath)
        })
    except Exception as e:
        print(f"[Recording_Routes] ❌ Error recording session: {e}")
        return jsonify({"error": str(e)}), 500


@recording_bp.route('/api/recordings', methods=['GET'])
def api_list_recordings():
    """List all available recordings in data/*/recordings/."""
    try:
        print(f"[Recording_Routes] 🔍 Checking for recordings in: {BASE_DATA_DIR}")
        if not BASE_DATA_DIR.exists():
            print(f"[Recording_Routes] 📂 Directory not found: {BASE_DATA_DIR}")
            return jsonify([])

        recordings = []
        # Look for *.csv in any subdirectory's "recordings" folder
        for file in BASE_DATA_DIR.glob('**/recordings/*.csv'):
            stat = file.stat()
            # Determine sensor type from parent folder's parent (if it matches data/SENSOR/recordings)
            # file.parent is recordings, file.parent.parent is the sensor folder
            sensor = file.parent.parent.name if file.parent.parent != BASE_DATA_DIR else "General"
            
            recordings.append({
                "name": file.name,
                "size": stat.st_size,
                "created": stat.st_ctime,
                "sensor": sensor,
                "type": file.name.split('__')[0],
                "path": str(file.relative_to(BASE_DATA_DIR)).replace('\\', '/')
            })
            
        # Also check the legacy location data/recordings/*.csv
        legacy_dir = BASE_DATA_DIR / "recordings"
        if legacy_dir.exists():
            for file in legacy_dir.glob('*.csv'):
                # Avoid duplicates if glob already found it
                if any(r['name'] == file.name for r in recordings):
                    continue
                stat = file.stat()
                recordings.append({
                    "name": file.name,
                    "size": stat.st_size,
                    "created": stat.st_ctime,
                    "sensor": "General",
                    "type": file.name.split('__')[0],
                    "path": str(file.relative_to(BASE_DATA_DIR)).replace('\\', '/')
                })

        # Sort by creation time (newest first)
        recordings.sort(key=lambda x: x['created'], reverse=True)
        return jsonify(recordings)
    except Exception as e:
        print(f"[Recording_Routes] ❌ Error listing recordings: {e}")
        return jsonify({"error": str(e)}), 500


@recording_bp.route('/api/recordings/<path:filepath>', methods=['GET'])
def api_get_recording(filepath):
    """Get the content of a specific recording using its relative path."""
    try:
        # Prevent traversal
        if '..' in filepath:
            return jsonify({"error": "Invalid path"}), 400
            
        full_path = BASE_DATA_DIR / filepath

        if not full_path.exists():
            return jsonify({"error": f"Recording not found at {filepath}"}), 404

        if full_path.suffix.lower() == '.csv':
            # Parse CSV back into JSON format for the frontend
            data = {"metadata": {}, "data": []}
            with open(full_path, 'r', newline='') as f:
                first_line = f.readline()
                if first_line.startswith("# METADATA: "):
                    try:
                        data["metadata"] = json.loads(first_line[len("# METADATA: "):].strip())
                    except Exception:
                        pass
                else:
                    f.seek(0)
                
                reader = csv.reader(f)
                header = next(reader, None)
                if header and header[0] == 'timestamp':
                    channel_keys = header[1:]
                    for row in reader:
                        if not row:
                            continue
                        record = {"timestamp": float(row[0]) if row[0] else 0.0, "channels": {}}
                        for i, ck in enumerate(channel_keys):
                            if i + 1 < len(row):
                                try:
                                    record["channels"][ck] = float(row[i+1])
                                except ValueError:
                                    record["channels"][ck] = row[i+1]
                        data["data"].append(record)
        else:
            with open(full_path, 'r') as f:
                data = json.load(f)

        return jsonify(data)
    except Exception as e:
        print(f"[Recording_Routes] ❌ Error getting recording: {e}")
        return jsonify({"error": str(e)}), 500
