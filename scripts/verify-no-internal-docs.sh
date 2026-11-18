#!/bin/sh
# scripts/verify-no-internal-docs.sh
#
# Deploy-time guard (task #474): assert that the runtime Docker image
# does NOT contain internal documentation. Intended to run inside the
# runtime stage of the multi-stage Dockerfile, after every COPY step.
#
# Background
# ----------
# Task #473 made docs/ and *.md part of the Docker BUILDER context so
# that `npm run lint:version` (run from `npm run build`) can walk the
# repo and verify @managed-version markers. The runtime stage is
# supposed to stay clean by cherry-picking specific paths
# (dist/, shared/, migrations/, etc.) and never `COPY .`-ing the whole
# tree. That invariant is what keeps internal docs out of the shipped
# container, and it's documented in .dockerignore.
#
# Nothing actively enforced that invariant — until this script. If
# someone adds a `COPY . .` (or `COPY docs/ ...`) to the runtime stage
# of Dockerfile, OR if a newly cherry-picked subtree happens to drag a
# stray *.md file along with it, this guard fails the docker build
# before the image can be tagged or pushed.
#
# What it checks
# --------------
#   1. /app/docs MUST NOT exist at all.
#   2. NO *.md files anywhere under /app, at any depth, EXCEPT:
#        a. anything under /app/node_modules/ (third-party READMEs are
#           expected to ship with their packages — they're not
#           "internal" docs).
#        b. paths in the explicit ALLOWED_MD allowlist below
#           (intentionally-shipped docs that the runtime serves).
#
# Adding a new intentional markdown file
# --------------------------------------
# If you add a new *.md to a runtime-cherry-picked path on purpose
# (e.g. a doc that the server reads at runtime), append its path to
# ALLOWED_MD with a one-line rationale comment. Otherwise, strip the
# stray file in the Dockerfile runtime stage with a targeted
# `RUN rm -f ./relative/path.md` after the COPY that brought it in.
#
# Usage
# -----
#   sh verify-no-internal-docs.sh [ROOT]
#
# ROOT defaults to /app (the runtime image's WORKDIR).

set -eu

ROOT="${1:-/app}"

# --- Allowlist of intentionally-shipped *.md files --------------------
# Newline-separated, paths relative to $ROOT. Comments after `#` on the
# same line are stripped.
#
# Each entry MUST come with a comment explaining WHY this markdown file
# is intentionally part of the published runtime image.
#
# (Currently empty: as of task #476 the documentation viewer reads from
# `dist/runtime-docs.json` instead of raw *.md files at runtime, so no
# *.md needs to ship with the image.)
ALLOWED_MD=''

if [ ! -d "$ROOT" ]; then
    printf '[verify-no-internal-docs] FAIL: root %s does not exist\n' "$ROOT" >&2
    exit 1
fi

print_help() {
    printf '\n  The runtime image is meant to ship only the bundled server,\n' >&2
    printf '  its production node_modules, and the cherry-picked runtime\n' >&2
    printf '  files listed in the Dockerfile runtime stage. Internal docs\n' >&2
    printf '  (docs/, README.md, *.md, etc.) must NOT be present anywhere\n' >&2
    printf '  under /app outside of /app/node_modules, except for the\n' >&2
    printf '  explicit allowlist documented at the top of\n' >&2
    printf '  scripts/verify-no-internal-docs.sh.\n\n' >&2
    printf '  Likely causes:\n' >&2
    printf '    * A stray `COPY . .` was added to the runtime stage of\n' >&2
    printf '      Dockerfile, dragging top-level *.md files (README.md,\n' >&2
    printf '      SECURITY.md, ARCHITECTURE.md, etc.) into the image.\n' >&2
    printf '    * A stray `COPY docs/ ...` was added, materialising the\n' >&2
    printf '      internal docs/ tree at /app/docs.\n' >&2
    printf '    * A newly cherry-picked directory contains a stray *.md\n' >&2
    printf '      file (e.g. an auto-generated README) that should be\n' >&2
    printf '      removed post-COPY in the Dockerfile, OR explicitly\n' >&2
    printf '      added to the ALLOWED_MD allowlist if it is meant to\n' >&2
    printf '      ship.\n\n' >&2
    printf '  See .dockerignore for the runtime-stays-clean invariant\n' >&2
    printf '  and task #474 for context.\n\n' >&2
}

# Hard fail: docs/ must not exist at all in the runtime image.
if [ -d "$ROOT/docs" ]; then
    printf '\n[verify-no-internal-docs] FAIL: %s/docs exists in the runtime image\n' "$ROOT" >&2
    print_help
    exit 1
fi

# Build a normalised list of allowed RELATIVE paths (one per line, no
# comments, no blank lines, no leading/trailing whitespace).
ALLOWED_LIST=$(printf '%s\n' "$ALLOWED_MD" \
    | sed 's/#.*$//' \
    | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' \
    | grep -v '^$' || true)

# Recursive scan for *.md anywhere under $ROOT, pruning node_modules.
# Use newline as the IFS so paths containing spaces (e.g.
# "README (copy).md") are handled correctly.
all_md=$(find "$ROOT" \
    -path "$ROOT/node_modules" -prune \
    -o -type f -name '*.md' -print \
    | LC_ALL=C sort)

stray_count=0
# shellcheck disable=SC2034  # tmpfile collected via append below
stray_lines=""

OLD_IFS=$IFS
IFS='
'
for md in $all_md; do
    # Strip the "$ROOT/" prefix to get a path relative to $ROOT.
    rel=${md#"$ROOT/"}
    # Check against the allowlist.
    is_allowed=0
    for allowed in $ALLOWED_LIST; do
        if [ "$rel" = "$allowed" ]; then
            is_allowed=1
            break
        fi
    done
    if [ "$is_allowed" -eq 0 ]; then
        stray_count=$((stray_count + 1))
        stray_lines="${stray_lines}  - ${md}
"
    fi
done
IFS=$OLD_IFS

if [ "$stray_count" -gt 0 ]; then
    printf '\n[verify-no-internal-docs] FAIL: %d stray internal *.md file(s) in the runtime image:\n' "$stray_count" >&2
    printf '%s' "$stray_lines" >&2
    print_help
    exit 1
fi

allowed_count=$(printf '%s\n' "$ALLOWED_LIST" | grep -cv '^$' || true)
printf '[verify-no-internal-docs] OK — no stray internal *.md under %s (node_modules excluded; %s allowlisted)\n' "$ROOT" "$allowed_count"
