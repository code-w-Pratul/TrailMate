# =============================================================================
# TrailMate API
#
# Build context is the REPOSITORY ROOT, not server/, because this is an npm
# workspaces monorepo: the lockfile and the hoisted dependency tree live at the
# root, and `npm ci` needs every workspace manifest present to resolve it.
#
#   docker build -f server/Dockerfile -t trailmate-api .
# =============================================================================

# ---- Stage 1: production dependencies --------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

# Manifests only, so this layer is cached until a dependency actually changes.
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json

# `--workspace` limits the install to the API; `--omit=dev` drops Jest, ESLint
# and mongodb-memory-server, which have no business in a runtime image.
RUN npm ci --omit=dev --workspace trailmate-server --include-workspace-root \
    && npm cache clean --force


# ---- Stage 2: runtime -------------------------------------------------------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    PORT=5000 \
    # Surface real memory limits to V8 so the container is not OOM-killed.
    NODE_OPTIONS=--max-old-space-size=384

WORKDIR /app

# `tini` gives us a real init: without PID 1 signal handling, SIGTERM never
# reaches Node and the graceful shutdown in server.js would never run.
RUN apk add --no-cache tini \
    && addgroup -S trailmate \
    && adduser -S trailmate -G trailmate

# npm hoists the whole tree to the root node_modules in a workspaces install.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./package.json
COPY server/package.json ./server/package.json

# Source last: the layer that changes most often.
COPY server/src ./server/src
COPY server/scripts ./server/scripts

# Never run as root.
USER trailmate

EXPOSE 5000

# Uses the dedicated liveness probe, which touches no third-party API and no
# database — a health check that depends on OpenWeatherMap is not a health check.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/src/server.js"]
