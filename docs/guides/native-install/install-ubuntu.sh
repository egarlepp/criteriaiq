#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# CriteriaIQ — native Ubuntu install scaffolding
# ----------------------------------------------------------------------------
# This script is NON-BINDING SCAFFOLDING. The supported install path is still
# `docker compose up -d --build` (see docs/guides/self-hosting.md). This file
# exists so the team can evaluate a Docker-free deployment to a fresh Ubuntu
# 22.04 / 24.04 LTS host.
#
# What it does (in order):
#   1. Updates the OS and (optionally) enables unattended security upgrades + UFW.
#   2. Installs system dependencies (Node 24.x via NodeSource, Chromium for
#      puppeteer-core, build toolchain, postgresql-client).
#   3. Asks how PostgreSQL should be provided:
#        a) install PostgreSQL 16 locally on this host
#        b) use an external DATABASE_URL the operator already has
#        c) skip — operator will configure the database later
#   4. Creates a dedicated `criteriaiq` Linux SYSTEM user (unprivileged,
#      no shell, no password) that will own the files and run the Node
#      process under systemd. This is NOT the application's admin login —
#      that's a separate row in the `users` table created later by the
#      in-app /setup wizard. See README.md → "Two different users to keep
#      straight" for the distinction.
#      Also creates the /opt/criteriaiq install tree,
#      /var/lib/criteriaiq/{data,uploads} writable volumes, and
#      /etc/criteriaiq/env (mode 0640) with generated SESSION_SECRET and
#      ENCRYPTION_KEY.
#   5. Clones the repo, runs `npm ci --legacy-peer-deps`, `npm run build`,
#      then `npm prune --omit=dev` to mirror the runtime image's footprint.
#   6. Installs the systemd unit, runs `daemon-reload`, and enables --now.
#
# Run as root (or with sudo). Run with `--dry-run` to print the plan only.
#
# Usage:
#   sudo bash install-ubuntu.sh                # interactive
#   sudo bash install-ubuntu.sh --dry-run      # show actions, change nothing
#   sudo bash install-ubuntu.sh --no-harden    # skip UFW + unattended-upgrades
#   sudo REPO_URL=https://github.com/.../criteriaiq.git bash install-ubuntu.sh
# ----------------------------------------------------------------------------
set -euo pipefail

# ------------------------------ Configuration ------------------------------- #
INSTALL_DIR="${INSTALL_DIR:-/opt/criteriaiq}"
DATA_DIR="${DATA_DIR:-/var/lib/criteriaiq/data}"
UPLOADS_DIR="${UPLOADS_DIR:-/var/lib/criteriaiq/uploads}"
ETC_DIR="${ETC_DIR:-/etc/criteriaiq}"
USER_NAME="${USER_NAME:-criteriaiq}"
GROUP_NAME="${GROUP_NAME:-criteriaiq}"
APP_PORT="${APP_PORT:-5000}"
NODE_MAJOR="${NODE_MAJOR:-24}"  # keep in sync with the Dockerfile base image
REPO_URL="${REPO_URL:-https://github.com/your-org/criteriaiq.git}"
REPO_REF="${REPO_REF:-main}"

DRY_RUN=0
HARDEN=1
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --no-harden) HARDEN=0 ;;
    -h|--help)
      sed -n '2,30p' "$0"; exit 0 ;;
  esac
done

run() {
  if [[ $DRY_RUN -eq 1 ]]; then
    printf '  [dry-run] %s\n' "$*"
  else
    eval "$@"
  fi
}

require_root() {
  if [[ $EUID -ne 0 ]]; then
    echo "ERROR: this script must run as root (try: sudo bash $0)" >&2
    exit 1
  fi
}

require_ubuntu() {
  if ! grep -qiE 'ubuntu' /etc/os-release 2>/dev/null; then
    echo "WARNING: this script is tested on Ubuntu 22.04 / 24.04 LTS only." >&2
    echo "Continue anyway? [y/N] "
    read -r ans
    [[ "$ans" =~ ^[Yy]$ ]] || exit 1
  fi
}

ask() {
  # ask "prompt" "default"
  local prompt="$1" default="${2:-}"
  local reply
  if [[ -n "$default" ]]; then
    read -rp "$prompt [$default]: " reply
    echo "${reply:-$default}"
  else
    read -rp "$prompt: " reply
    echo "$reply"
  fi
}

require_root
require_ubuntu

echo "======================================================================"
echo " CriteriaIQ native Ubuntu installer (scaffolding — see docs)"
echo "======================================================================"
echo " Install dir:   $INSTALL_DIR"
echo " Data dir:      $DATA_DIR"
echo " Uploads dir:   $UPLOADS_DIR"
echo " Config dir:    $ETC_DIR"
echo " System user:   $USER_NAME"
echo " App port:      $APP_PORT"
echo " Node major:    $NODE_MAJOR"
echo " Repo:          $REPO_URL ($REPO_REF)"
echo " Dry run:       $([[ $DRY_RUN -eq 1 ]] && echo yes || echo no)"
echo " OS hardening:  $([[ $HARDEN -eq 1 ]] && echo yes || echo no)"
echo "======================================================================"
echo

# --------------------- Phase 1 — OS update + hardening --------------------- #
echo "[1/7] Updating OS packages..."
run "apt-get update -y"
run "DEBIAN_FRONTEND=noninteractive apt-get -y -o Dpkg::Options::=--force-confnew upgrade"
run "DEBIAN_FRONTEND=noninteractive apt-get -y autoremove"

if [[ $HARDEN -eq 1 ]]; then
  echo
  echo "[1b] Security hardening — unattended upgrades + UFW firewall"
  echo "     This enables daily auto-installation of Ubuntu security patches"
  echo "     and opens only SSH (22), HTTP (80), HTTPS (443) on the firewall."
  echo "     Skip with --no-harden if you manage these elsewhere (e.g. cloud-init)."
  HARDEN_REPLY=$(ask "Apply OS hardening now? (y/n)" "y")
  if [[ "$HARDEN_REPLY" =~ ^[Yy]$ ]]; then
    run "DEBIAN_FRONTEND=noninteractive apt-get -y install unattended-upgrades apt-listchanges"
    run "dpkg-reconfigure -f noninteractive unattended-upgrades || true"
    run "DEBIAN_FRONTEND=noninteractive apt-get -y install ufw"
    run "ufw --force default deny incoming"
    run "ufw --force default allow outgoing"
    run "ufw allow 22/tcp"
    run "ufw allow 80/tcp"
    run "ufw allow 443/tcp"
    run "ufw --force enable"
    echo "     Hardening applied. Verify with: sudo ufw status verbose"
  fi
fi

# ------------------------- Phase 2 — System deps -------------------------- #
echo
echo "[2/7] Installing system dependencies..."
run "DEBIAN_FRONTEND=noninteractive apt-get -y install \
    ca-certificates curl gnupg git build-essential python3 \
    chromium-browser fonts-liberation tini postgresql-client \
    openssl"

# Node ${NODE_MAJOR} via NodeSource
if ! command -v node >/dev/null 2>&1 || [[ $(node -v 2>/dev/null | sed 's/v//;s/\..*//') -lt $NODE_MAJOR ]]; then
  echo "     Installing Node ${NODE_MAJOR}.x from NodeSource..."
  run "curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -"
  run "DEBIAN_FRONTEND=noninteractive apt-get -y install nodejs"
fi

# ----------------------- Phase 3 — Postgres choice ------------------------ #
echo
echo "[3/7] PostgreSQL configuration"
echo "  CriteriaIQ needs PostgreSQL 14+. Choose how this host should reach it:"
echo "    1) Install PostgreSQL 16 locally on this server (recommended for"
echo "       single-VM installs — script will create db/user/password)."
echo "    2) I have an existing database — I'll paste DATABASE_URL now."
echo "    3) Skip — I'll configure DATABASE_URL myself before first start."
PG_CHOICE=$(ask "Choose 1, 2, or 3" "1")

DATABASE_URL=""
case "$PG_CHOICE" in
  1)
    echo "     Installing postgresql-16..."
    run "DEBIAN_FRONTEND=noninteractive apt-get -y install postgresql postgresql-contrib"
    run "systemctl enable --now postgresql"

    DB_PASSWORD="$(openssl rand -hex 24)"
    if [[ $DRY_RUN -eq 0 ]]; then
      sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
CREATE USER criteriaiq WITH PASSWORD '${DB_PASSWORD}';
CREATE DATABASE criteriaiq OWNER criteriaiq;
GRANT ALL PRIVILEGES ON DATABASE criteriaiq TO criteriaiq;
SQL
    fi
    DATABASE_URL="postgresql://criteriaiq:${DB_PASSWORD}@127.0.0.1:5432/criteriaiq"
    echo "     Local Postgres ready. Generated password stored in ${ETC_DIR}/env."
    ;;
  2)
    DATABASE_URL=$(ask "Paste DATABASE_URL (e.g. postgresql://user:pass@host:5432/db)")
    if [[ -z "$DATABASE_URL" ]]; then
      echo "ERROR: empty DATABASE_URL." >&2; exit 1
    fi
    ;;
  3)
    echo "     Skipping Postgres setup. You MUST set DATABASE_URL in"
    echo "     ${ETC_DIR}/env before starting the service."
    DATABASE_URL=""
    ;;
  *)
    echo "ERROR: invalid choice '$PG_CHOICE'." >&2; exit 1
    ;;
esac

# ---------------------- Phase 4 — System user + dirs ---------------------- #
echo
echo "[4/7] Creating Linux system user and directory tree..."
echo "     ('$USER_NAME' is an unprivileged OS account that will own the files"
echo "     and run the Node process. It is NOT the app admin login — that"
echo "     gets created later through the in-app /setup wizard.)"
if ! id -u "$USER_NAME" >/dev/null 2>&1; then
  run "useradd --system --home-dir $INSTALL_DIR --shell /usr/sbin/nologin $USER_NAME"
fi
run "install -d -m 0755 -o $USER_NAME -g $GROUP_NAME $INSTALL_DIR"
run "install -d -m 0750 -o $USER_NAME -g $GROUP_NAME $DATA_DIR"
run "install -d -m 0750 -o $USER_NAME -g $GROUP_NAME $UPLOADS_DIR"
run "install -d -m 0750 -o root -g $GROUP_NAME $ETC_DIR"

# ----------------- Phase 5 — Clone, build, prune dev deps ----------------- #
echo
echo "[5/7] Fetching and building the application..."
if [[ ! -d "$INSTALL_DIR/.git" ]]; then
  run "sudo -u $USER_NAME git clone --branch '$REPO_REF' --depth 1 '$REPO_URL' '$INSTALL_DIR'"
else
  run "sudo -u $USER_NAME git -C '$INSTALL_DIR' fetch --depth 1 origin '$REPO_REF'"
  run "sudo -u $USER_NAME git -C '$INSTALL_DIR' checkout '$REPO_REF'"
  run "sudo -u $USER_NAME git -C '$INSTALL_DIR' reset --hard 'origin/$REPO_REF'"
fi
run "sudo -u $USER_NAME -H bash -c 'cd $INSTALL_DIR && npm ci --legacy-peer-deps'"
run "sudo -u $USER_NAME -H bash -c 'cd $INSTALL_DIR && npm run build'"
run "sudo -u $USER_NAME -H bash -c 'cd $INSTALL_DIR && npm prune --omit=dev --legacy-peer-deps'"

# ---------------------- Phase 6 — Secrets + env file ---------------------- #
echo
echo "[6/7] Generating secrets and writing $ETC_DIR/env..."
SESSION_SECRET="$(openssl rand -hex 48)"
ENCRYPTION_KEY="$(openssl rand -hex 32)"

if [[ $DRY_RUN -eq 0 ]]; then
  umask 077
  cat > "$ETC_DIR/env" <<ENV
# CriteriaIQ runtime environment — generated by install-ubuntu.sh
# Mode 0640, owned by root:$GROUP_NAME. Treat as a secret.
NODE_ENV=production
PORT=$APP_PORT
PUBLIC_APP_URL=http://$(hostname -f 2>/dev/null || hostname):$APP_PORT
DATABASE_URL=$DATABASE_URL
SESSION_SECRET=$SESSION_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
PUPPETEER_SKIP_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
# Optional: bootstrap admin (uncomment + fill to skip the wizard's first user)
# BOOTSTRAP_ADMIN_EMAIL=
# BOOTSTRAP_ADMIN_PASSWORD=
# BOOTSTRAP_ADMIN_NAME=
ENV
  chown root:"$GROUP_NAME" "$ETC_DIR/env"
  chmod 0640 "$ETC_DIR/env"
fi

# ----------------------- Phase 7 — systemd service ------------------------ #
echo
echo "[7/7] Installing systemd unit..."
UNIT_SRC="$INSTALL_DIR/docs/guides/native-install/criteriaiq.service"
UNIT_DST="/etc/systemd/system/criteriaiq.service"

if [[ -f "$UNIT_SRC" && $DRY_RUN -eq 0 ]]; then
  sed \
    -e "s|@INSTALL_DIR@|$INSTALL_DIR|g" \
    -e "s|@DATA_DIR@|$DATA_DIR|g" \
    -e "s|@UPLOADS_DIR@|$UPLOADS_DIR|g" \
    -e "s|@ETC_DIR@|$ETC_DIR|g" \
    -e "s|@USER_NAME@|$USER_NAME|g" \
    -e "s|@GROUP_NAME@|$GROUP_NAME|g" \
    "$UNIT_SRC" > "$UNIT_DST"
  chmod 0644 "$UNIT_DST"
fi

run "systemctl daemon-reload"
run "systemctl enable --now criteriaiq.service"

echo
echo "======================================================================"
echo " Done. Check status with:  systemctl status criteriaiq"
echo " Tail logs with:           journalctl -u criteriaiq -f"
echo " Open the setup wizard at: http://<host>:$APP_PORT/setup"
echo "======================================================================"
