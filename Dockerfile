# syntax=docker/dockerfile:1.7

# ----------------------------------------------------------------------------
# Stage 1 — build the client and server bundles
# ----------------------------------------------------------------------------
# Node 24 LTS. Keep both stages, package.json "engines", and
# .github/workflows/ci.yml on the same major. Node 20 (EOL 2026-04) broke
# every Salesforce feature at runtime: jsforce >= 3.10.17 pulls in undici 8,
# which requires Node >= 22.19 and throws on import under Node 20.
FROM node:24-bookworm-slim AS builder

ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Tools needed by puppeteer / native modules during install
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# patches/ must be present before `npm ci` so the postinstall hook
# (`patch-package`) can apply our Radix UI fixes against the freshly
# installed node_modules. Without this, the client bundle would ship
# with the unpatched Radix code that triggers the React 19 "Maximum
# update depth exceeded" loop (task #531).
COPY package.json package-lock.json* ./
COPY patches ./patches
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps

COPY . .

# Build the production client (Vite) and server (esbuild) bundles
RUN npm run build

# ----------------------------------------------------------------------------
# Stage 2 — minimal runtime image
# ----------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=5000 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    DEBIAN_FRONTEND=noninteractive

# Chromium runtime deps for puppeteer-core PDF rendering, plus tini for
# proper PID-1 signal forwarding (so SIGTERM from the orchestrator
# actually reaches Node and triggers a graceful shutdown).
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium chromium-sandbox ca-certificates fonts-liberation curl tini \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install ONLY production dependencies in the runtime stage. This avoids
# copying the builder's full node_modules (~1k packages incl. dev deps)
# across stages just to prune it. drizzle-kit is intentionally a runtime
# dependency: the first-run setup wizard's /api/setup/initialize step
# shells out to `npx drizzle-kit push --force`.
# Copy patches/ so the `patch-package` postinstall hook applies cleanly
# in the runtime stage as well. The runtime image doesn't import Radix
# UI (the client bundle is pre-built in the builder stage), so these
# patches are functional no-ops here, but copying them keeps the
# install step deterministic instead of relying on patch-package's
# graceful "no patch files found" behaviour.
COPY package.json package-lock.json* ./
COPY patches ./patches
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --legacy-peer-deps

# Copy build output and the files drizzle-kit needs at runtime
# (drizzle.config.ts imports ./shared/schema/index.ts, and tsconfig.json
# is required for it to load the TypeScript schema).
COPY --from=builder /app/dist ./dist
# task-474: strip *.md files that ship inside the TinyMCE npm package
# (CHANGELOG.md, README.md, license.md) and end up in dist/public/tinymce/
# via the tinymceSelfHostPlugin Vite copy. They are not needed at runtime
# and would trip verify-no-internal-docs.sh. The Vite plugin already
# filters them during copy (vite.config.ts), but this is an additional
# safety net consistent with the migrations/ and attached_assets/ patterns.
RUN find ./dist/public/tinymce -type f -name '*.md' -delete 2>/dev/null || true
# server/assets contains runtime-read files (e.g. the base64 Internal
# logo embedded in outbound emails) that aren't bundled by esbuild.
COPY --from=builder /app/server/assets ./server/assets
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/migrations ./migrations
# task-474 / task-476: strip every *.md dragged in by the migrations/
# cherry-pick. These are dev-only notes that the runtime no longer
# reads — task #476 moved /api/docs/db-schema-refactor (which used to
# read migrations/db_refactor/README.md straight off disk) to the
# bundled `dist/runtime-docs.json` produced by
# scripts/bundle-runtime-docs.ts. Stripping them keeps the runtime
# image free of internal docs (verify-no-internal-docs.sh).
RUN find ./migrations -type f -name '*.md' -delete
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/attached_assets ./attached_assets
# task-474: strip stray *.md files inside attached_assets/. Only the
# sibling .png attachments are rendered by the client (see
# client/src/components/about/Stage5AFramework.tsx); the .md files are
# source notes from the original upload and would otherwise trip the
# internal-docs guard.
RUN find ./attached_assets -type f -name '*.md' -delete
# version.json is read at runtime by GET /api/version. Without this copy
# the runner falls back to a hardcoded sentinel and the login/setup
# screens display a stale version number.
COPY --from=builder /app/version.json ./version.json

# Build-time commit + date so GET /api/version (and the Error Audit Log "Build"
# stamp) reflect the ACTUAL deployed commit, not the commit baked into
# version.json at the last version bump. Pass at build time, e.g.
#   --build-arg GIT_COMMIT="$(git rev-parse --short HEAD)" --build-arg BUILD_DATE="$(date -u +%FT%TZ)"
# Coolify/Dokploy expose the source commit as SOURCE_COMMIT; getVersionInfo()
# honors GIT_COMMIT first, then SOURCE_COMMIT. Empty default = fall back to
# version.json, so this is a harmless no-op until the platform supplies the arg.
ARG GIT_COMMIT=""
ARG BUILD_DATE=""
ENV GIT_COMMIT=$GIT_COMMIT \
    BUILD_DATE=$BUILD_DATE

# Persistent volume targets — the wizard writes data/db-config.json and
# admin uploads (customer logos, branding images, project artifacts,
# 5A attachments, doc uploads) land under attached_assets/.
# /app/uploads is a legacy mount point that's no longer written to, but
# is kept around so existing docker-compose.yml files with the
# `app_uploads:/app/uploads` line don't break on upgrade. Only chown the
# writable paths so we don't spend ~90s recursing through node_modules.
RUN mkdir -p /app/data /app/uploads /app/attached_assets \
 && chown -R node:node /app/data /app/uploads /app/attached_assets
# CRITICAL: /app/attached_assets MUST be declared as a volume so admin
# uploads (customer logos, custom branding, etc.) survive container
# rebuilds. Without this, every redeploy nukes the directory and every
# previously-uploaded file 404's behind /api/files/. Docker auto-seeds
# named volumes from the image content on first creation, so the
# bundled defaults shipped via `COPY --from=builder` above (Internal
# logos, criteriaiq-logo_white.png, 5A framework imagery, etc.) still
# populate fresh installs.
VOLUME ["/app/data", "/app/uploads", "/app/attached_assets"]

# task-474: deploy-time guard. Assert the runtime image is free of
# internal docs (docs/ and *.md outside node_modules). The .dockerignore
# intentionally lets docs/ and *.md into the BUILDER stage so
# `npm run lint:version` can validate @managed-version markers
# (task-473), but the runtime stage is supposed to cherry-pick specific
# paths only. This RUN fails the docker build the moment a stray
# `COPY . .` or `COPY docs/` reintroduces internal docs into the
# published image. The script is bind-mounted so it does NOT end up in
# the final image layers.
RUN --mount=type=bind,source=scripts/verify-no-internal-docs.sh,target=/tmp/verify-no-internal-docs.sh \
    sh /tmp/verify-no-internal-docs.sh /app

USER node
EXPOSE 5000

# Generous start period: on a fresh deploy the setup wizard runs
# `drizzle-kit push` against an empty Postgres before the server is
# fully ready, which can take well over 20s on slow disks.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD curl -fsS http://127.0.0.1:5000/api/setup/status || exit 1

# Run Node directly (not via npm) under tini so signals propagate cleanly.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
