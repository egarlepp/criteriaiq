---
name: version-bump
description: Cut a new CriteriaIQ release end-to-end. Raises the minor version (vX.Y.Z → vX.(Y+1).0) with `./update-version.sh <version>` (which writes version.json and refreshes @managed-version markers in 8 long-form docs), then writes the changelog for everything merged since the last release in ChangeLogDrawer.tsx + RecentUpdatesContent.tsx, checks each new feature has its doc in docs/features/, prunes shipped items from docs/plans/backlog.md, and verifies `lint:version` passes. Use when the user says "/version-bump", "bump to v0.X.0", "release X.Y", or "cut a version".
---

# version-bump — release a new CriteriaIQ version

CriteriaIQ versions are managed by a single source of truth (`version.json`) plus a coordinated set of changelog and prose updates. This skill is the checklist.

## How versions move (since v0.9.0)

- **Every merge to main** raises the patch number automatically: `.github/workflows/version-patch.yml` runs `./update-version.sh --patch`, which sets `version` to the `release` plus the number of commits merged since it (v0.10.0 → v0.10.1 → v0.10.2 …). It writes only `version.json`: no changelog, no Introduction page, no doc markers. PRs never edit the version.
- **This skill is the only thing that writes up changes.** It cuts the next release by raising the **minor** number and resetting the patch to 0 (v0.10.7 → v0.11.0), then writes the Change log and Recent Updates for every update merged since the previous release. Raise the major number (v1.0.0) only when the user asks for it by name.
- `version.json` has `version` (what the app shows), `release` (the last cut) and `updates` (one row per merge since the release, titled by the PR title; shown by the sidebar version link and in the About → Introduction Recent Updates card). Doc `@managed-version` markers and `lint:version` follow `release`.
- Cutting a release empties `updates` (`./update-version.sh vX.Y.0` writes `"updates": []`). Before running it, read the current `updates` list in `version.json`: it is the ready-made list of everything in the release, each row already carrying its Change Log `category` (security / feature / improvement / fix), and a good starting point for the changelog. The About page button that opens the changelog is labelled "Major Release Change Log": it shows only what this skill writes.

## Inputs

Required:
- **New version string** in the form `vX.Y.0`. Default: the next minor after `release` in `version.json` (e.g. `release: v0.10.0` → `v0.11.0`). The script refuses any version that doesn't end in `.0`.

The changelog range is everything merged since the commit that set the current `release`:

```bash
BASE=$(git log --first-parent -1 --format=%H -G'"release"' -- version.json)
git log --first-parent --oneline --invert-grep --grep='^chore(version):' "$BASE"..origin/main
```

Cloud clones are shallow: run `git fetch --unshallow origin` first, both for this range and before `npm run docs:dates`.

Optional but recommended:
- **Changelog content** organized by category — see Step 3 for the four categories.
- **Two-or-three-sentence "what's new" headline** for the Recent Updates highlight on the Flight Deck "What's New!" widget.

If the user just says "/version-bump" or "bump to v0.11.0" without changelog content, draft the four-category breakdown yourself from the merged PRs in the range above, and ask them to check the wording in the release PR.

## Step 0 — Pre-flight checks

```bash
# Confirm no uncommitted changes (the version bump should be its own commit)
git status

# Confirm the working branch is what the user expects
git branch --show-current

# Confirm version.json's current value
cat version.json
```

If the working tree isn't clean, stop and ask the user how to handle the existing changes. Don't auto-commit them.

## Step 1 — Run the version script

```bash
./update-version.sh v0.11.0
```

The script (`update-version.sh`):
1. Writes a new `version.json` with `version`, `buildDate`, `gitCommit`, `environment`.
2. Sweeps every `@managed-version` marker in 8 long-form doc files (listed in the script's `MANAGED_DOCS` array) and rewrites the `vN.N.NN` literal on those marker-bearing lines.

The script lists which files it touched. Verify the output:
- 8 docs should show "Refreshed @managed-version markers"
- If any are skipped with "warn: …", investigate before continuing.

## Step 2 — Verify the lint gate passes

```bash
npm run lint:version
```

Should output: `OK: all NN @managed-version line(s) match version.json (vX.X.XX). Scanned NNN files.`

If it fails, the script missed a marker or a hand-edited doc has a stale literal. Fix manually before proceeding — this gate runs at deploy time and a mismatch will block the build.

## Step 3 — Update the changelog drawer

Open `client/src/components/about/ChangeLogDrawer.tsx`. The file is ~2000 lines and contains ~60 `<AccordionItem>` blocks, one per past release, in **descending version order** (newest first).

**Add a new `<AccordionItem>` at the top of the list**, structured like the existing entries. The four standard subsections, in this order:

```tsx
<AccordionItem value="v0.11.0">
  <AccordionTrigger>v0.11.0 — <one-line tagline></AccordionTrigger>
  <AccordionContent>
    <div className="space-y-4">
      {/* 🔒 Security & Compliance */}
      <section>
        <h4 className="font-semibold text-red-700 dark:text-red-300">🔒 Security & Compliance</h4>
        <ul className="list-disc pl-5 space-y-1">
          <li>…</li>
        </ul>
      </section>

      {/* 🆕 New Features */}
      <section>
        <h4 className="font-semibold text-green-700 dark:text-green-300">🆕 New Features</h4>
        <ul className="list-disc pl-5 space-y-1">
          <li>…</li>
        </ul>
      </section>

      {/* 🔧 Improvements */}
      <section>
        <h4 className="font-semibold text-blue-700 dark:text-blue-300">🔧 Improvements</h4>
        <ul className="list-disc pl-5 space-y-1">
          <li>…</li>
        </ul>
      </section>

      {/* 🐛 Fixes */}
      <section>
        <h4 className="font-semibold text-amber-700 dark:text-amber-300">🐛 Fixes</h4>
        <ul className="list-disc pl-5 space-y-1">
          <li>…</li>
        </ul>
      </section>
    </div>
  </AccordionContent>
</AccordionItem>
```

Match the existing entries' exact JSX structure — copy the most recent entry as a template and edit. Skip an entire section if it's empty for this release (don't write empty `<ul>` blocks). Order: Security → New → Improvements → Fixes (as documented in `docs/guides/version-update-guide.md`).

## Step 4 — Update the Recent Updates highlight

Open `client/src/components/about/RecentUpdatesContent.tsx` (or `IntroductionTab.tsx` — `RecentUpdatesContent.tsx` is the actual current file based on the directory listing; it's small, ~4 KB). It feeds the Flight Deck "What's New!" widget only (About → Introduction's Recent Updates card shows the interim update list instead). This shows ONLY the "NEW:" highlight — typically 1–3 bullets covering the most user-visible item from the new release.

Replace (or prepend, depending on the existing pattern — read first to confirm) the previous version's highlight bullets with the new release's highlight. Don't list every change — this surface is meant to be glanceable.

If the prior version's highlight should be retained as historical context, follow the existing convention (which may keep a short "Previous Updates" tail; check the file).

## Step 5 — Check the feature docs

Feature behavior is documented in `docs/features/` (one doc per feature), not in `PROJECT_REFERENCE.md`. For each **New Features** entry in the changelog:

- Confirm a doc in `docs/features/` covers it (the PR that built it should have added or updated one). If none exists, write it: what it does, who can use it, the tables/files/services/routes involved, and any setting it adds. Match the structure of a recent feature doc such as `docs/features/project-summary-api.md`.
- If the doc is meant to be readable in the app, add it to `server/docs-manifest.ts`, the About page documentation list in `client/src/pages/about.tsx`, and `server/search/searchConfig.ts`, then run `npm run docs:dates`.

Touch `PROJECT_REFERENCE.md` only if the release changed a convention or architecture rule (a new build gate, a new required pattern, a moved directory). It is not a feature catalogue; the old per-feature list is frozen at `docs/archive/feature-specifications.md`.

Skip this step if the release is purely fixes/improvements with no new feature surface.

## Step 6 — Prune the backlog

Open `docs/plans/backlog.md`. Delete every row that shipped in this release (it is now in the changelog and its feature doc). Add a row for any follow-up the merged PRs deferred ("offered, not done", "out of scope for this PR"), with its source. One line per item; don't rewrite the whole file — surgical edits only.

## Step 7 — Commit, but DO NOT push

Stage and commit the version bump as a single commit:

```bash
git add version.json \
        client/src/components/about/ChangeLogDrawer.tsx \
        client/src/components/about/RecentUpdatesContent.tsx \
        docs/plans/backlog.md \
        docs/features/ \
        docs/architecture/workflow-diagram.md \
        docs/architecture/design-document.md \
        docs/architecture/project-overview.md \
        docs/architecture/navigation-sitemap.md \
        docs/guides/api-reference.md \
        docs/guides/deployment.md \
        docs/guides/version-update-guide.md \
        docs/features/email-triggers-reference.md
        # Add PROJECT_REFERENCE.md, server/docs-manifest.ts, client/src/pages/about.tsx,
        # server/search/searchConfig.ts and server/doc-dates.json only if Step 5 touched them.

git status        # show the user what will be committed
git diff --cached --stat

git commit -m "release: v0.11.0 — <one-line tagline>

<Optional: short 2-3 sentence description.>

https://claude.ai/code/session_<this-session-id>
"
```

**Do NOT `git push` automatically.** The user pushes when they're ready to deploy. Tell them the next steps:

```
v0.11.0 staged on <branch>. To deploy:
  1. Inspect the diff one more time:    git show HEAD
  2. Push to remote:                    git push -u origin <branch>
  3. The Dokploy build will pick it up; lint:version will block if any markers are stale.
  4. Verify post-deploy:
     - /api/version returns the new version
     - About → Changelog drawer shows the new entry
     - Sidebar footer / login footer shows the new version label
```

## Step 8 — Final report

```
version-bump v0.10.4 → v0.11.0
──────────────────────────────
✅ version.json:                updated
✅ @managed-version markers:    8 docs refreshed
✅ lint:version:                passed (NN markers match version.json)
✅ ChangeLogDrawer.tsx:         new AccordionItem prepended
✅ RecentUpdatesContent.tsx:    highlight updated
✅ Feature docs:                every new feature has a docs/features/ doc
✅ backlog.md:                  shipped items removed, deferred follow-ups added
📦 Commit:                      <sha> "release: v0.11.0 — <tagline>"
🔜 Next:                        git push when ready
```

## Anti-patterns to avoid

- ❌ Don't push automatically — the user controls the deploy moment.
- ❌ Don't bump the version without changelog content — the public-facing changelog drawer goes stale.
- ❌ Don't skip the lint:version verification — the build will fail at deploy time anyway.
- ❌ Don't edit the doc markers by hand — the script does it. Hand edits drift.
- ❌ Don't forget the four sections of the changelog (Security, New, Improvements, Fixes), even if some are empty in a given release. Empty sections should be omitted from the JSX, but the **order** of present sections must always be: Security → New → Improvements → Fixes.
- ❌ Don't bump versions backwards or out of order — strictly monotonic. CI doesn't enforce this; humans must.
- ❌ Don't co-commit unrelated changes with the version bump — keep the release commit clean for diff review and easy rollback.
