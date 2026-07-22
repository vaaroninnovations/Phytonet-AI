# PhytoNet AI — Production frontend image
# ---------------------------------------------------------------
# Multi-stage build:
#   1. `builder`  — Node 20, installs deps with yarn, produces optimized
#                   CRA build via `yarn build` (uses REACT_APP_BACKEND_URL
#                   passed in as a build-arg so the API URL is baked in).
#   2. `runner`   — nginx:alpine (~40 MB), serves /build with SPA fallback
#                   and proxies /api → backend:8001 over the Docker network.
#
# Build:
#   docker build -f frontend/Dockerfile \
#     --build-arg REACT_APP_BACKEND_URL=https://phytonet.example.com \
#     -t phytonet-frontend .
# ---------------------------------------------------------------

# ─────────────── Stage 1 — Builder ───────────────
FROM node:20-bookworm-slim AS builder

WORKDIR /app/frontend

# Install deps first for optimal layer caching.
# NOTE: yarn.lock is glob-copied (`yarn.lock*`) so the build still works if
# a fresh clone somehow lacks the lockfile — we then fall back to a
# lockfile-less install. In production the lockfile MUST be tracked.
COPY frontend/package.json ./
COPY frontend/yarn.lock* ./
RUN if [ -f yarn.lock ]; then \
      yarn install --frozen-lockfile --network-timeout 600000; \
    else \
      echo "⚠️  yarn.lock missing — falling back to non-deterministic install"; \
      yarn install --network-timeout 600000; \
    fi

# Copy source and build
COPY frontend/ ./

# REACT_APP_BACKEND_URL is inlined at build time by CRA. Pass it via
# --build-arg or docker-compose args. Defaults to "/" (same-origin) so
# nginx below proxies /api → backend.
ARG REACT_APP_BACKEND_URL=""
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

# Speed up CRA production build and skip source maps for smaller image
ENV GENERATE_SOURCEMAP=false CI=true

RUN yarn build

# ─────────────── Stage 2 — Runtime ───────────────
FROM nginx:1.27-alpine AS runner

# nginx config with SPA fallback + /api proxy to backend service
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Static bundle
COPY --from=builder /app/frontend/build /usr/share/nginx/html

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
