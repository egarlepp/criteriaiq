## Summary

<!-- What does this change and why? Link the issue it closes, e.g. "Closes #123". -->

## How it was tested

<!-- Tests added or updated, and any manual checks (light and dark mode, different roles, languages). -->

## Checklist

- [ ] `npm run check`, `npm run build` and `npx vitest run` pass locally
- [ ] User-facing strings use `t()` and new keys are in all six locale files
- [ ] New or changed UI works in light and dark mode
- [ ] Schema changes include an idempotent `migrations/NNN_*.sql` and a refreshed `shared/schema-snapshot.json`
- [ ] The feature's doc in `docs/features/` is updated if behavior changed
- [ ] No secrets, customer data or personal information in the diff
