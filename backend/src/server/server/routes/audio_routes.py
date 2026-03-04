from flask import Blueprint, jsonify, request, send_from_directory
from pathlib import Path
import os
import werkzeug

audio_bp = Blueprint('audio', __name__)

# Paths
# Calculate root reliably
_current_dir = Path(__file__).resolve().parent
PROJECT_ROOT = _current_dir.parent.parent.parent.parent.parent
BASE_AUDIO_DIR = (PROJECT_ROOT / "frontend" / "public" / "data" / "audio").resolve()

# Ensure directory exists
if not BASE_AUDIO_DIR.exists():
    BASE_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    print(f"INFO: Created audio directory at: {BASE_AUDIO_DIR}")
else:
    print(f"INFO: Using audio directory at: {BASE_AUDIO_DIR}")

ALLOWED_EXTENSIONS = {'.mp3', '.wav', '.ogg'}

def allowed_file(filename):
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS

@audio_bp.route('/api/audio/tracks', methods=['GET'])
def list_tracks():
    """List all available audio tracks in data/audio/."""
    try:
        tracks = []
        for file in BASE_AUDIO_DIR.iterdir():
            if file.is_file() and allowed_file(file.name):
                stat = file.stat()
                tracks.append({
                    "name": file.name,
                    "size": stat.st_size,
                    "created": stat.st_ctime,
                    "url": f"/data/audio/{file.name}"
                })
        
        # Sort by creation time (newest first)
        tracks.sort(key=lambda x: x['created'], reverse=True)
        return jsonify(tracks)
    except Exception as e:
        print(f"ERROR: Error listing audio tracks: {e}")
        return jsonify({"error": str(e)}), 500

@audio_bp.route('/api/audio/upload', methods=['POST'])
def upload_track():
    """Upload a new audio track."""
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file part"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400
        
        if file and allowed_file(file.filename):
            filename = werkzeug.utils.secure_filename(file.filename)
            filepath = BASE_AUDIO_DIR / filename
            
            # Check if file exists, if so append timestamp to avoid overwrite
            if filepath.exists():
                import time
                filename = f"{Path(filename).stem}_{int(time.time())}{Path(filename).suffix}"
                filepath = BASE_AUDIO_DIR / filename
                
            file.save(str(filepath))
            print(f"SUCCESS: Audio track uploaded: {filepath}")
            
            return jsonify({
                "status": "success",
                "message": f"Track uploaded: {filename}",
                "track": {
                    "name": filename,
                    "url": f"/data/audio/{filename}"
                }
            })
        else:
            return jsonify({"error": "File type not allowed"}), 400
            
    except Exception as e:
        print(f"ERROR: Error uploading audio track: {e}")
        return jsonify({"error": str(e)}), 500

@audio_bp.route('/api/audio/track/<path:filename>', methods=['GET'])
def get_audio_file(filename):
    """Serve an audio track."""
    try:
        # Prevent traversal
        if ".." in filename or filename.startswith("/"):
            return jsonify({"error": "Invalid filename"}), 400

        print(f"DEBUG: [AudioAPI] Request for: {filename}")
        
        # Look for the file
        filepath = (BASE_AUDIO_DIR / filename).resolve()
        
        if not filepath.exists():
            print(f"ERROR: [AudioAPI] File NOT FOUND on disk at: {filepath}")
            # Log contents of directory to help debug
            try:
                files = os.listdir(str(BASE_AUDIO_DIR))
                print(f"DEBUG: [AudioAPI] Directory contents ({len(files)} files): {files[:10]}...")
            except: pass
            return jsonify({"error": f"Track '{filename}' not found"}), 404
            
        print(f"SUCCESS: [AudioAPI] Serving track: {filepath} ({filepath.stat().st_size} bytes)")
        return send_from_directory(str(BASE_AUDIO_DIR), filename)
    except Exception as e:
        print(f"ERROR: [AudioAPI] Server error serving {filename}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@audio_bp.route('/api/audio/track/<filename>', methods=['DELETE'])
def delete_track(filename):
    """Delete an audio track."""
    try:
        # Path protection: ensure filename is safe
        safe_filename = werkzeug.utils.secure_filename(filename)
        filepath = BASE_AUDIO_DIR / safe_filename
        
        if not filepath.exists():
            return jsonify({"error": "Track not found"}), 404
            
        filepath.unlink()
        print(f"SUCCESS: Audio track deleted: {filepath}")
        
        return jsonify({
            "status": "success",
            "message": f"Track deleted: {safe_filename}"
        })
    except Exception as e:
        print(f"ERROR: Error deleting audio track: {e}")
        return jsonify({"error": str(e)}), 500
