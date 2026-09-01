# 002 · private neutral worker package

## Changes

- Added the private ESM workspace source package `@einfach/excel-worker`.
- Exposed only `.` and `./wasm-worker-factory` as exact TypeScript source exports.
- Added the framework-neutral `WorkerLike` and `WorkerFactory` contract.
- Added the root TypeScript project reference and a manifest boundary test.

The initial worker project incorrectly set `noEmit`, which TypeScript rejects for
a project reached through the root build reference (`TS6310`). The project now
uses declaration-only emit like the other source packages; the targeted
verification command continues to pass `--noEmit` explicitly.

## Lockfile

`pnpm-lock.yaml` adds only the `excel/excel-worker` importer. Its two workspace
links are `@einfach/excel-wasm` and `@einfach/spreadsheet-ui-core`; the offline
frozen install materialized both package-local dependency symlinks.

## Verification

- `pnpm install --lockfile-only` — passed.
- `pnpm install --offline --frozen-lockfile` — passed.
- `pnpm exec tsc -p excel/excel-worker/tsconfig.json --noEmit --pretty false` — passed.
- `pnpm exec jest excel/excel-worker/test/package-boundary.test.ts --runInBand --no-coverage` — passed (3 tests).
- `node --test rules/react-rust-only-boundary.test.mjs` — passed (11 tests).
- `pnpm run typecheck:apps` — passed after removing the referenced project's
  configured `noEmit`.
- `pnpm exec tsc --build tsconfig.json --pretty false --force` — passed after
  explicitly importing the Jest test globals used by the package boundary test.
