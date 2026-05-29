# ─────────────────────────────────────────────────────────────────────────────
# NeuroTECH-BCI — Frontend (multi-stage)
#
#  Stage 1 (builder): Node 20 Alpine — install deps & build Vite app
#  Stage 2 (runner):  Nginx Alpine    — serve static dist, proxy /api & /socket.io
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first for better layer caching
COPY package.json package-lock.json ./

# Clean install (uses lock-file exactly)
RUN npm ci

# Copy source and build
COPY . .

# VITE_API_URL can be passed at build time; defaults to relative (same-origin proxy)
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

# ── Stage 2: Serve ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Remove the default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our custom nginx config
COPY nginx.conf /etc/nginx/conf.d/app.conf

# Copy the built Vite output
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx serves on port 80
EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
