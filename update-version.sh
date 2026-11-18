#!/bin/bash

# Script to manually update version for current deployment
# Usage: ./update-version.sh vX.Y.0     # cut a release (the /version-bump skill)
#        ./update-version.sh --patch    # recompute the patch number + interim updates (CI only)
#
# version.json carries three fields:
#   "release" — the last release cut by /version-bump (e.g. v0.10.0). Doc
#               @managed-version markers track this value.
#   "version" — what the app shows: the release with its patch number set to
#               the count of commits merged to main since that release
#               (e.g. v0.10.3). .github/workflows/version-patch.yml runs
#               `--patch` after every merge, so PRs never edit the version.
#
#   "updates" — the interim updates in the current release, newest first, one
#               per merge ({ version, date, pr, title }; title = the PR title).
#               `--patch` rebuilds it; a release cut empties it. The version
#               link in the sidebar and About → Introduction show it.
#
# `--patch` (scripts/version-patch.mjs) counts first-parent commits on HEAD since the commit that last
# changed the "release" line, skipping the workflow's own `chore(version):`
# commits. Counting (rather than incrementing) keeps it correct when merges
# race or a workflow run is skipped. It never touches the docs.
#
# What a release cut does:
#   1. Writes version.json (single source of truth read by /api/version
#      and every UI surface — see task-389).
#   2. Sweeps the long-form reference docs and replaces the version literal
#      on every line carrying an `@managed-version` HTML-comment marker, so
#      the docs no longer drift on each release (see task-393).
#
# To re-target a doc literal, add the marker to the end of the line:
#     ### Recent Updates (vX.X.XX) <!-- @managed-version: ... -->
# (The literal in this comment uses the placeholder `vX.X.XX` on purpose
# so it does not look like a managed line to the drift check —
# `npm run lint:version` flags any real `vN.N.NN` literal on a marker line
# that disagrees with version.json. See scripts/check-managed-version-markers.ts.
# That same check is wired into `npm run build` (chained ahead of
# `vite build` alongside `lint:toasts`, see task-467), so a stale marker
# can no longer reach a published bundle even if nobody runs the lint
# locally — the production build will refuse to compile.)
# The first real vN.N.NN literal on the line will be rewritten in place.
# Lines without the marker (changelog tables, "Previous Updates" sections,
# feature-added-in-vX tags) are left alone — they are append-only history.

set -euo pipefail

if [ "${1:-}" = "--patch" ]; then
  # Recomputes "version" and the interim "updates" list from git history.
  exec node scripts/version-patch.mjs
fi

VERSION=${1:-"v0.0.6"}
if ! echo "$VERSION" | grep -qE '^v[0-9]+\.[0-9]+\.0$'; then
  echo "error: a release must end in .0 (got $VERSION); patch numbers come from --patch" >&2
  exit 1
fi

echo "Setting application version to: $VERSION"

# For immediate development testing, set environment variable
export VITE_APP_VERSION="$VERSION"

# Create version.json for the API to read
cat > version.json << EOF
{
  "version": "$VERSION",
  "release": "$VERSION",
  "buildDate": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "gitCommit": "$(git rev-parse --short HEAD 2>/dev/null || echo 'dev')",
  "environment": "production",
  "updates": []
}
EOF

echo "Wrote version.json"

# --- Doc-marker sweep --------------------------------------------------------
# Files that carry @managed-version markers. Adding a new doc with a marker?
# Append it here.
MANAGED_DOCS=(
  "docs/architecture/workflow-diagram.md"
  "docs/architecture/design-document.md"
  "docs/architecture/project-overview.md"
  "docs/architecture/navigation-sitemap.md"
  "docs/guides/api-reference.md"
  "docs/guides/deployment.md"
  "docs/guides/version-update-guide.md"
  "docs/features/email-triggers-reference.md"
)

UPDATED=()
for doc in "${MANAGED_DOCS[@]}"; do
  if [ ! -f "$doc" ]; then
    echo "  warn: $doc not found, skipping" >&2
    continue
  fi
  if ! grep -q "@managed-version" "$doc"; then
    echo "  warn: $doc has no @managed-version markers, skipping" >&2
    continue
  fi
  # On every line containing the marker, rewrite the first vX.X.XX literal
  # to the new VERSION. Marker stays put. -E for extended regex.
  sed -i -E "/@managed-version/ s/v[0-9]+\.[0-9]+\.[0-9]+/$VERSION/" "$doc"
  UPDATED+=("$doc")
done

echo "Version updated to $VERSION"
if [ ${#UPDATED[@]} -gt 0 ]; then
  echo "Refreshed @managed-version markers in:"
  for f in "${UPDATED[@]}"; do
    echo "  - $f"
  done
fi
echo ""
echo "To verify:"
echo "  - Check sidebar / login footer / setup footer for version display"
echo "  - Visit /api/version endpoint"
echo "  - Inspect doc markers: grep -rn '@managed-version' docs/"
