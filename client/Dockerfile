# =============================================================================
# TrailMate web client
#
# Build context is the REPOSITORY ROOT (npm workspaces monorepo):
#
#   docker build -f client/Dockerfile -t trailmate-web .
#
# The result is a static bundle served by nginx, which also reverse-proxies /api
# to the API container — so the browser talks to exactly one origin and there is
# no CORS configuration to get wrong in production.
# =============================================================================

# ---- Stage 1: build the bundle ---------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json

# Dev dependencies are required here: Vite and Tailwind are build tools.
RUN npm ci --workspace trailmate-client --include-workspace-root

COPY client ./client

# Left empty on purpose: nginx serves the API under the same origin, so a
# relative /api is correct. Override only for a split deployment.
#   docker build --build-arg VITE_API_URL=https://api.example.com/api ...
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build --workspace trailmate-client


# ---- Stage 2: serve --------------------------------------------------------
FROM nginx:stable-alpine AS runtime

# `envsubst` lets the upstream API address be configured at container start
# rather than baked in at build time.
ENV API_UPSTREAM=http://api:5000

COPY client/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/client/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider -q http://127.0.0.1/healthz || exit 1

# The stock nginx entrypoint renders /etc/nginx/templates/*.template through
# envsubst before starting, so no custom entrypoint script is needed.
