# ADR 0020: Solid Excel root cutover

- Status: Accepted
- Date: 2026-08-31

## Context

`@einfach/solid-excel` exposed the legacy table API at its root while the current
spreadsheet UI lived under `/vnext`. That naming made the compatibility surface
look canonical and left worker and stylesheet imports branded as transitional.

The worker factory contains `import.meta` URL construction. Importing it through
the ordinary public barrel would make UI-only environments parse worker-specific
code.

## Decision

The package root exports the current API from `src/index.ts`. `/vnext` remains an
alias to the same implementation, while the old root API moves to `/legacy`.
`/demos` and `/i18n` now expose their current implementations.

Canonical worker subpaths are `/worker-factory`, `/worker-runtime`,
`/worker-runtime-full`, and `/worker-runtime-core`. Their existing `/vnext-*`
forms remain exact aliases. `/styles.css` is canonical and
`/vnext-styles.css` remains an alias.

The root barrel must not export demos or the worker factory. This keeps ordinary
imports free of demo code and `import.meta` worker URL construction.

## Consequences

Consumers of the former root `Table`, stores, and legacy sheet APIs must import
from `@einfach/solid-excel/legacy`. Existing `/vnext*` consumers continue to
work. Both source-condition entries and precompiled ESM/declaration entries ship
for the current and legacy trees.
