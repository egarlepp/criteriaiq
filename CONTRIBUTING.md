# Contributing to CriteriaIQ

Thanks for helping improve CriteriaIQ. This guide covers how to report problems, propose changes and get a pull request merged.

## Reporting bugs and requesting features

- Search [existing issues](../../issues) first to avoid duplicates.
- Use the **Bug report** or **Feature request** form when you open an issue. They ask for the details we need to act on it.
- Ask usage questions in [Discussions](../../discussions) (when enabled) rather than issues.
- Report security vulnerabilities privately, as described in [SECURITY.md](SECURITY.md). Never in a public issue.

## Development setup

Requirements: Node.js 24+, npm, and PostgreSQL 16 (or Docker).

```bash
npm install --no-audit --no-fund --legacy-peer-deps
cp .env.example .env    # set DATABASE_URL, or leave it unset and use the /setup wizard
npm run db:push         # create the schema
npm run dev             # http://localhost:5000
```

[`docs/guides/local-dev-setup.md`](docs/guides/local-dev-setup.md) has the full walkthrough, including a Postgres container.

Read [`PROJECT_REFERENCE.md`](PROJECT_REFERENCE.md) before you write code. It holds the conventions every change must follow. Feature docs live in [`docs/features/`](docs/features/).

## Making a change

1. Fork the repository and create a branch from `main` named for one deliverable, for example `fix/map-date-rounding` or `feat/csv-export`.
2. Keep each pull request to one logical change.
3. Follow the project conventions:
   - **i18n:** every user-facing string goes through `t()`. Add new keys to `client/src/i18n/locales/en-US.json` and to the five other locale files with real translations.
   - **Dark mode:** every component supports dark mode with `dark:` variants.
   - **Tables** use `SortableTableHead`; status pills use `<StatusBadge>`; destructive actions use `ConfirmationDialog`.
   - **Data access** lives in the `server/storage/` mixins, never in route handlers. Routes go in `server/routes/*-routes.ts`.
   - **Schema changes** need an idempotent `migrations/NNN_*.sql` file plus `npm run schema:snapshot`.
4. Add or update tests for what you changed (Vitest, `*.test.ts(x)` next to the code or under `__tests__/`).
5. Update the feature's doc in `docs/features/` if behavior changed.

## Before you open a pull request

Run these locally. CI runs the same checks and a PR can't merge until they pass.

```bash
npm run check     # TypeScript type-check
npm run build     # 15 lint gates + production bundle
npx vitest run    # unit and route tests
```

## Pull requests

- Fill in the pull request template.
- Write the PR title as a short, user-facing summary. It becomes the entry in the in-app "Recent updates" list after merge.
- Don't edit `version.json`. A workflow sets the version after each merge.
- A maintainer reviews every PR. Expect review comments; push follow-up commits to the same branch rather than opening a new PR.
- PRs are merged with a merge commit by default.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE.txt).
