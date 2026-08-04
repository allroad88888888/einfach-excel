# find-replace

Owns the ticketed Core lifecycle for find, replace, and read-only recovery.

## Module boundaries

- `state.ts`: private source atoms only.
- `projection-atoms.ts`: immutable public projections.
- `basic-commands.ts`: dialog, form, compatibility, and capability commands.
- `search-commands.ts`: exact-correlated search and cursor focus.
- `mutation-domain.ts` / `mutation-commands.ts`: replace evidence and dispatch.
- `refresh-recovery.ts`: projection acceptance and read-only refresh recovery.
- `target-domain.ts`, `ledger-domain.ts`, and `value-domain.ts`: ticket validity,
  bounded evidence ledger, and pure value helpers.

## Atom classification

- Source atoms are private to `state.ts`; consumers use only immutable projections.
- Derived atoms: query, cursor, form, lifecycle, capability, availability/error,
  pending/mutation-blocked status, operation diagnostics, and capped-result notice.
- Commands: dialog/form updates, capability capture, compatibility writes, search,
  step, mutation, and refresh recovery.

The match page is bounded by `MAX_FIND_PAGE = 500`. The evidence ledger is bounded
to 32 entries and prevents automatic resend after an unknown replace outcome.

Tests: `test/find-replace.test.ts`.
