# Build Stage for Frontend
FROM node:18-alpine as frontend_build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Python Stage
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV DJANGO_SETTINGS_MODULE config.settings

WORKDIR /app

# Install system dependencies (if any needed for numpy/scipy)
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
# Add Django specific requirements if not in root requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir django channels daphne "channels_redis>=4.0" djangorestframework joblib pandas numpy scikit-learn

# Copy Backend Code
COPY backend /app/backend/
# Copy ML Data/Models (assuming data is still at root for now, or moved?)
# User moved data? No, user movedsrc/... to backend/core. data folder is still at root.
COPY data /app/data/
# Copy Frontend Build from previous stage
COPY --from=frontend_build /app/frontend/dist /app/frontend/dist

# Set Workdir to backend where manage.py is
WORKDIR /app/backend

# Collect Static
RUN python manage.py collectstatic --noinput

# Expose port (Daphne default)
EXPOSE 8000

# Start Daphne
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "config.asgi:application"]
