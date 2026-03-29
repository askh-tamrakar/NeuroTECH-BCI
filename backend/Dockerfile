# ─────────────────────────────────────────────────────────────────────────────
# NeuroTECH-BCI — Backend
# Python 3.11 slim image; runs the Flask-SocketIO API server (remote mode)
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim

# System deps needed by some Python packages (scipy, matplotlib, pyserial, pynput)
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        g++ \
        libglib2.0-0 \
        libxcb1 \
        libxi6 \
        libxtst6 \
        libx11-dev \
        libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install Python dependencies first (layer-cache friendly)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend source
COPY . .

# Web server port (Flask-SocketIO)
EXPOSE 5005

# Healthcheck — poll the /api/status endpoint once the server is up
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5005/api/status')" || exit 1

# --remote suppresses the local frontend; pipeline orchestrates all backend components
CMD ["python", "-u", "pipeline.py", "--remote"]
