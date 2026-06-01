"""
Local authentication routes — backup when remote auth.php is unreachable.

Users are stored as JSON files in data/users/<username>.json.
Passwords are kept in plaintext to match the existing remote auth.php pattern.
Admin status is set manually by editing is_admin: true in the user file.
"""
import json
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path

import requests as _http
from flask import Blueprint, request, jsonify

from src.utils.paths import get_base_data_dir

auth_bp = Blueprint("auth", __name__)

# Remote auth endpoint for admin sync
_REMOTE_AUTH_URL = "https://neurotech.withaspire.in/auth.php"

# Shared secret that auth.php validates on admin-sync requests
_ADMIN_SYNC_TOKEN = "local_admin_sync_key_2026"

# In-memory token → username map (cleared on server restart)
_active_tokens: dict[str, str] = {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _users_dir() -> Path:
    path = get_base_data_dir() / "users"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _user_file(username: str) -> Path:
    return _users_dir() / f"{username}.json"


def _load_user(username: str) -> dict | None:
    f = _user_file(username)
    if not f.exists():
        return None
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except Exception:
        return None


def _save_user(user: dict) -> None:
    _user_file(user["username"]).write_text(
        json.dumps(user, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def _all_users() -> list[dict]:
    users = []
    for uf in _users_dir().glob("*.json"):
        try:
            users.append(json.loads(uf.read_text(encoding="utf-8")))
        except Exception:
            continue
    return users


def _check_admin(req) -> bool:
    """Return True if the Bearer token belongs to an admin user."""
    auth_header = req.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return False
    token = auth_header[7:]
    username = _active_tokens.get(token)
    if not username:
        return False
    user = _load_user(username)
    return bool(user and user.get("is_admin"))


def _public_user(user: dict) -> dict:
    """Return user dict without the password field."""
    return {k: v for k, v in user.items() if k != "password"}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@auth_bp.route("/api/auth/signup", methods=["POST"])
def local_signup():
    """Create a new local user. No OTP — local accounts are auto-verified."""
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    name = (data.get("name") or username).strip()
    profile_image = data.get("profile_image") or ""

    if not email or not username or not password:
        return jsonify({"status": "error", "message": "email, username, and password are required"}), 400

    if "@" not in email:
        return jsonify({"status": "error", "message": "Invalid email address"}), 400

    # Duplicate username check
    if _user_file(username).exists():
        return jsonify({"status": "error", "message": "Username already exists"}), 409

    # Duplicate email check
    for existing in _all_users():
        if existing.get("email") == email:
            return jsonify({"status": "error", "message": "Email already registered locally"}), 409

    user: dict = {
        "id": str(uuid.uuid4()),
        "email": email,
        "username": username,
        "password": password,
        "name": name,
        "is_admin": False,
        "is_verified": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if profile_image:
        user["avatarUrl"] = profile_image

    _save_user(user)
    return jsonify({"status": "success", "message": "Local account created. No verification needed."})


@auth_bp.route("/api/auth/login", methods=["POST"])
def local_login():
    """Authenticate a local user and return a session token."""
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    user = _load_user(username)
    if not user or user.get("password") != password:
        return jsonify({"status": "error", "message": "Invalid credentials"}), 401

    token = "local_session_" + secrets.token_hex(16)
    _active_tokens[token] = username

    return jsonify({"status": "success", "user": _public_user(user), "token": token})


@auth_bp.route("/api/auth/users", methods=["GET"])
def list_local_users():
    """Admin-only: list all local users (without passwords)."""
    if not _check_admin(request):
        return jsonify({"status": "error", "message": "Unauthorized"}), 403

    users = [_public_user(u) for u in _all_users()]
    return jsonify({"status": "success", "users": users, "count": len(users)})


@auth_bp.route("/api/auth/sync", methods=["POST"])
def sync_to_server():
    """Admin-only: push all local users to the remote auth.php server."""
    if not _check_admin(request):
        return jsonify({"status": "error", "message": "Unauthorized"}), 403

    users = _all_users()
    if not users:
        return jsonify({"status": "success", "synced": 0, "message": "No local users to sync"})

    try:
        resp = _http.post(
            f"{_REMOTE_AUTH_URL}?action=admin-sync",
            json={"sync_token": _ADMIN_SYNC_TOKEN, "users": users},
            timeout=15,
        )
        resp.raise_for_status()
        return jsonify(resp.json())
    except _http.exceptions.Timeout:
        return jsonify({"status": "error", "message": "Sync timed out — remote server did not respond"}), 504
    except Exception as exc:
        return jsonify({"status": "error", "message": f"Sync failed: {exc}"}), 502
