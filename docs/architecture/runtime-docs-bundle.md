# Runtime documentation bundle

> Where the in-app About page documentation viewer reads from at
> runtime, and how the build keeps the runtime Docker image free of
> internal documentation.

## Background

The About page in the React client
(`client/src/pages/about.tsx`) renders a documentation library by
fetching `/api/docs/<slug>` endpoints registered in
`server/routes.ts`. Historically each of those routes did a
`fs.readFileSync(path.join(process.cwd(), 'docs/<file>.md'))` against
the live `docs/` tree.

That worked in a dev checkout, where the working directory
**is** the repo, but silently 404'd in any published Docker image:
the runtime stage of `Dockerfile` intentionally cherry-picks
specific paths and never `COPY`s the `docs/` tree, and
`scripts/verify-no-internal-docs.sh` actively fails the build if a
stray `*.md` file leaks in (task #474).

The customer-facing docs viewer therefore had to stop reading raw
repo files at runtime — task #476.

## How it works now

The system has three pieces:

### 1. `server/docs-manifest.ts` — single source of truth

Lists every doc file the runtime serves, plus the URL(s) (one or more
`/api/docs/...` API routes and optional `/docs/...` HTML routes) that
each file is served under.

Adding or renaming a doc means editing this one file. There is no
separate "list of routes to register" — `server/routes.ts` iterates
the manifest at startup and wires each route automatically.

### 2. `scripts/bundle-runtime-docs.ts` — build-time bundler

Run as part of `npm run build` (after `vite build` and `esbuild`,
before `verify-prod-bundle`). It:

- imports the manifest,
- reads each unique source `.md` file from disk,
- writes a single JSON object `{ "<source-path>": "<markdown>" }` to
  `dist/runtime-docs.json`.

If any source file referenced by the manifest is missing, the script
exits non-zero and the build fails — silent drops would silently
break a link on the About page.

### 3. `dist/runtime-docs.json` — runtime payload

The runtime image carries `dist/` (`COPY --from=builder /app/dist
./dist`), so this JSON ships with every production image. The doc
routes registered in `server/routes.ts` load it at server startup
and resolve content from the in-memory map.

In **development** (`NODE_ENV=development`) the server deliberately
skips the bundle even if `dist/runtime-docs.json` happens to exist on
disk from a prior `npm run build`. This avoids a footgun where a
stale bundle would silently shadow your live edits to `*.md` files
under `docs/`. The startup logs make the choice explicit:

- with bundle:  `--> Loaded runtime docs bundle: 45 doc(s) from dist/runtime-docs.json`
- skipping:     `--> NODE_ENV=development: ignoring dist/runtime-docs.json and serving docs live from the repo`

In **production** the runtime container has no `docs/` directory at
all, so the fallback never fires and the bundle is the only path
that resolves content.

## Why JSON, not raw `*.md` files in `dist/docs/`

`scripts/verify-no-internal-docs.sh` rejects every `*.md` file
anywhere under `/app` outside `node_modules`. Shipping the bundled
docs as `*.md` would force us to allowlist them one-by-one and would
weaken the guard against accidental docs leaks. Bundling everything
into a single `.json` blob keeps the guard absolute: zero `*.md`
files are intentionally part of the runtime image.

## Adding a new doc

1. Drop the `.md` file under `docs/` (or wherever it conceptually
   belongs in the repo).
2. Add an entry in `server/docs-manifest.ts` with the source path
   and the route(s) it should be served under.
3. Reference the new `/api/docs/<slug>` from the consumer (typically
   `client/src/pages/about.tsx`'s `documentationCategories`).
4. `npm run build` — the bundler will fail if the source path is
   wrong, otherwise the new doc will be picked up by the next
   deployed image.

No changes to `Dockerfile` or `scripts/verify-no-internal-docs.sh`
are needed for new docs.
