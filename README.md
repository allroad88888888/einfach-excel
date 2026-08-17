# Einfach Excel

[![CI](https://github.com/allroad88888888/einfach-excel/actions/workflows/ci.yml/badge.svg)](https://github.com/allroad88888888/einfach-excel/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Live demo](https://img.shields.io/badge/demo-live-0a7f5a.svg)](https://allroad88888888.github.io/einfach-excel/)

**Einfach Excel is a spreadsheet UI core with a bounded projection contract and a Rust/WASM workbook engine.**

[Explore the live demo](https://allroad88888888.github.io/einfach-excel/) · [Quickstart](./docs/QUICKSTART.md) · [中文文档](./README.zh-CN.md) · [Architecture](./docs/ARCHITECTURE.md) · [Contributing](./CONTRIBUTING.md)

## Why Einfach Excel?

Spreadsheet interfaces are deceptively hard: rendering, interaction, calculation, and data access need distinct ownership. Einfach Excel keeps the UI separate from the workbook implementation through explicit backend and projection boundaries.

Scale-related behavior is expressed as current code contracts rather than headline measurements:

- **Store records, not a geometric grid.** The workbook's row-and-column keyed storage and range traversal work from stored entries within the requested bounds.
- **Keep display data inside an explicit rectangle.** The UI core validates visible-viewport and explicit-range requests, then rejects results that do not match the request or exceed its rectangle.
- **Select range dependencies by geometry.** Formula ranges choose cell, row-band, column, or sheet invalidation roots through source-defined geometry rules.
- **Keep oversized commands rectangular.** Clear and formatting attempt backend range capabilities above their address-expansion limits; unsupported requests are refused instead of expanded into cell actions.

Read [scale facts](./docs/SCALE_FACTS.md) for code citations, [scale architecture](./docs/SCALE_ARCHITECTURE.md) for layer boundaries, and [dated scale observations](./docs/SCALE_OBSERVATIONS.md) for revision-scoped E2 records. These mechanisms make no performance, memory, capacity, transport, or production-SLA claim.

- **Keep calculation off the main thread.** The provided worker-backed Solid integration runs Rust/WASM workbook work in a Web Worker.
- **Choose your runtime.** `spreadsheet-ui-core` has no dependency on a DOM, Solid, React, a worker, or WASM. Connect it to the backend that fits your product.
- **Start with real spreadsheet behavior.** The stack covers selection, editing, keyboard interaction, clipboard operations, formulas, history, find/replace, validation, filtering, sorting, comments, and more.

## How it fits together

```text
Your application
       │
       ▼
Spreadsheet UI core ── visible-window projection ──► Backend port
       │                                                   │
       ▼                                                   ▼
Solid.js components                              Web Worker + Rust/WASM workbook
```

The UI core owns interaction state and the projection contract. A backend owns workbook data and mutations. The provided Solid adapter connects both to a virtualized grid and, when selected, a typed worker RPC boundary backed by the Rust formula engine.

## Packages and crates

| Location                     | Name                           | Purpose                                                                                      |
| ---------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| `excel/spreadsheet-ui-core/` | `@einfach/spreadsheet-ui-core` | Framework-agnostic atoms, types, interaction state, and visible-window projection contracts. |
| `excel/solid-excel/`         | `@einfach/solid-excel`         | Solid.js spreadsheet components and static or worker-backed adapters.                        |
| `excel/excel-core-ts/`       | `@einfach/excel-core-ts`       | TypeScript formula engine used for parity and as an alternate worker backend.                |
| `excel/rust/core/`           | `einfach-core`                 | Rust implementation of the atom store.                                                       |
| `excel/rust/excel-core/`     | `einfach-excel-core`           | Rust workbook and formula engine.                                                            |
| `excel/rust/wasm/`           | `einfach-wasm`                 | WASM bindings consumed by the Solid worker integration.                                      |
| `excel/excel-site/`          | `@einfach/excel-site`          | The static documentation and interactive demo site.                                          |

### Framework integrations

`@einfach/solid-excel` is the only currently provided UI-framework binding. `@einfach/spreadsheet-ui-core` is framework-agnostic, but that does not constitute an existing React or Vue integration: no React/Vue adapter package or usable integration path is currently provided.

### Release status and stability

Five packages were first published to npm on **2026-08-17** at version `0.1.0`:
`@einfach/spreadsheet-ui-core`, `@einfach/spreadsheet-ui-styles`,
`@einfach/excel-core-ts`, `@einfach/excel-wasm`, and `@einfach/solid-excel`.
They version as a fixed group — all five always move together.

```bash
npm install @einfach/solid-excel solid-js
```

Compatibility expectations for the `0.x` stage
([ADR 0017](./docs/decisions/0017-initial-release-version-0-1-0.md)):

- **Minor releases (`0.1` → `0.2`) may contain breaking changes.** Pin the
  minor (`~0.1.0`) if you need a stable API surface; each package ships a
  `CHANGELOG.md` that lists removals explicitly.
- Patch releases are fixes only.
- Supported Node.js baseline: **`>=22.12.0`**
  ([ADR 0018](./docs/decisions/0018-node-baseline-22-12.md)).
- `@einfach/solid-excel` ships dual-form artifacts
  ([ADR 0019](./docs/decisions/0019-solid-excel-dual-form-artifacts.md)):
  Vite + `vite-plugin-solid` consumers compile from source via the `solid`
  export condition; other bundlers get precompiled ESM. It targets bundler
  environments — bare-Node import is not supported. `solid-js`,
  `@einfach/core`, and `@einfach/solid` are peer dependencies: your app must
  hold exactly one copy of each (see
  [ADR 0001](./docs/decisions/0001-solid-js-single-instance.md)).
- TypeScript consumers of `@einfach/excel-wasm` need `lib` ≥ ES2023 plus DOM
  (or `skipLibCheck`); `moduleResolution: "bundler"` is the verified setup.

## Dated product facts

The entries below are dated source records for the named scopes only; they are
not a scorecard, recommendation, availability check, compatibility statement,
or performance comparison. `unknown` means the reviewed record did not provide
enough evidence for that field. All entries were verified on 2026-08-13 and
remain subject to the recorded review and withdrawal process.

| Dimension                  | Univer                                                                                                                                                                                                                                                                                                                          | Handsontable                                                                                                                                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| License                    | The cited repository `LICENSE` identifies its text as Apache License, Version 2.0. ([source](https://github.com/dream-num/univer/blob/ee85ccbef9693e81e99b0534f07c287c56ce9fce/LICENSE))                                                                                                                                        | The cited repository `LICENSE.txt` describes the software as dual-licensed and refers to separate non-commercial and commercial license documents. ([source](https://github.com/handsontable/handsontable/blob/95657194616688831eb689a531e4d6c7580ab7be/LICENSE.txt))                                                                  |
| Delivery form              | The cited CDN guide documents UMD global builds used through HTML `<script>` tags and names jsDelivr and unpkg. ([source](https://github.com/dream-num/documentation/blob/c61eab834d1a22621ee89711be65f92252e6e51b/content/guides/sheets/getting-started/installation/cdn.mdx))                                                 | The cited `@handsontable/react-wrapper` manifest declares CommonJS and ES-module entries, a type declaration path, and unpkg and jsDelivr paths. ([source](https://github.com/handsontable/handsontable/blob/95657194616688831eb689a531e4d6c7580ab7be/wrappers/react-wrapper/package.json))                                            |
| Data or backend decoupling | The cited Web Worker guide describes a separate Univer instance in the worker and RPC communication that synchronizes data and mutations with the main-thread instance. ([source](https://github.com/dream-num/documentation/blob/4910c62a96b2ccfd2086309b3d167cfd8f454b0b/content/guides/recipes/architecture/web-worker.mdx)) | `unknown`: the reviewed records identify no data, storage, transport, or backend boundary.                                                                                                                                                                                                                                             |
| Computation location       | In the cited Web Worker configuration, the guide states that formula computation occurs in the Web Worker thread. ([source](https://github.com/dream-num/documentation/blob/4910c62a96b2ccfd2086309b3d167cfd8f454b0b/content/guides/recipes/architecture/web-worker.mdx))                                                       | `unknown`: the reviewed records identify no calculation path, runtime, device, worker, or service boundary.                                                                                                                                                                                                                            |
| Framework integration      | The cited React 18 and 19 guide initializes Univer in `useEffect`, passes a React ref as the preset container, and calls `univerAPI.dispose()` in cleanup. ([source](https://github.com/dream-num/documentation/blob/00789a9db73c03685f68dc85f83df6023c3ca326/content/guides/sheets/getting-started/integrations/react.mdx))    | The cited React wrapper manifest names `@handsontable/react-wrapper`, declares root export entries, lists `handsontable` as a peer dependency, and lists React in development dependencies. ([source](https://github.com/handsontable/handsontable/blob/95657194616688831eb689a531e4d6c7580ab7be/wrappers/react-wrapper/package.json)) |
| Package-size basis         | `unknown`: no reviewed artifact record supplies the version or revision, included files, measurement form and command, and measurement date required for a size value.                                                                                                                                                          | `unknown`: no reviewed artifact record supplies the version or revision, included files, measurement form and command, and measurement date required for a size value.                                                                                                                                                                 |

The [Univer evidence ledger](./docs/UNIVER_PRODUCT_EVIDENCE.md) and [Handsontable evidence ledger](./docs/HANDSONTABLE_PRODUCT_EVIDENCE.md) record each fact's scope, limitation, verifier, owner, and next review date. Do not infer a product advantage from this table.

## Documented entry-path records

The dated records above identify two Univer documentation examples: UMD global
builds used through HTML `<script>` tags, and a React 18/19 example with effect
initialization, a ref container, and cleanup disposal. The Univer evidence
ledger records the source scope and limitations for both examples.

Einfach Excel's release-status section separately records its own publish
status. It is not part of a comparison between the products.

This section only indexes the cited documentation records. It does not
establish product availability, package installation, framework support,
compatibility, suitability, feature parity, performance, or ranking.

## Use it when you need

- an embeddable spreadsheet UI for a SaaS product or internal tool;
- a workbook-like workflow without coupling your UI to a particular data backend;
- responsive formula calculation that does not block the browser UI;
- a reference implementation for a Solid.js spreadsheet with Rust/WASM workers.

## Get started locally

### Prerequisites

- Node.js 18 or later (CI covers Node.js 18 and 20)
- pnpm 10
- Rust with the `wasm32-unknown-unknown` target and [wasm-pack](https://rustwasm.github.io/wasm-pack/)

### Install and build

```bash
git clone https://github.com/allroad88888888/einfach-excel.git
cd einfach-excel
pnpm install

npm run build
npm test
npm run lint:check
```

`npm run build` generates the WASM package when needed, then builds the TypeScript packages and bundles.

### Minimal repository-checkout example

The current UI integration is Solid-only and the project is documented for use
from a repository checkout. The landing-page example uses the workspace's
`@einfach/solid-excel/vnext` surface; it is not an npm-installation path:

```tsx
import {
  createStaticSpreadsheetBackend,
  SpreadsheetUiProvider,
  SpreadsheetGrid,
  SpreadsheetToolbar,
} from '@einfach/solid-excel/vnext'

const backend = createStaticSpreadsheetBackend({
  sheets: [{ id: 'sheet-1', name: 'Sheet1' }],
  matrix: [
    ['Item', 'Qty', 'Price'],
    ['Widget', 4, 9.5],
  ],
})

const viewport = {
  scrollTop: 0,
  scrollLeft: 0,
  viewportHeight: 320,
  viewportWidth: 640,
  rowHeight: 24,
  colWidth: 96,
  rowCount: 50,
  colCount: 16,
  overscanRows: 1,
  overscanCols: 1,
}

function Sheet() {
  return (
    <SpreadsheetUiProvider backend={backend}>
      <SpreadsheetToolbar />
      <SpreadsheetGrid sheetId="sheet-1" viewport={viewport} />
    </SpreadsheetUiProvider>
  )
}
```

## Reproducible verification

Run these commands from a repository checkout after `pnpm install`. They are
repeatable execution paths, not a statement about the current result: outcomes
depend on the revision you check out and on the local environment.

```bash
npm test

# Run focused package tests.
npx jest excel/spreadsheet-ui-core --no-coverage
npx jest excel/solid-excel --no-coverage

# Install Chromium before running browser E2E.
npm run e2e:install -w @einfach/solid-excel
NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel -- --project=wasm
NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel -- --project=ts
```

Read the [architecture decisions](./docs/decisions/) for the recorded design
rationale and the [backend parity matrix](./excel/solid-excel/e2e/BACKEND_PARITY.md)
for the two-backend E2E scope and its documented exceptions.

## See it in action

The [interactive demo](https://allroad88888888.github.io/einfach-excel/) uses the same components and worker boundary as the library. It includes focused examples for:

- formula evaluation, dynamic arrays, named ranges, and custom (including async) formulas;
- a virtualized large-sheet view backed by Rust/WASM in a worker;
- data validation, conditional formatting, filtering, sorting, find/replace, and clipboard tools;
- undo/redo, comments, protected sheets, printing, and the full spreadsheet workbench.

## Documentation

- [Quickstart](./docs/QUICKSTART.md) goes from install to a first formula on one page; [integration recipes](./docs/recipes/README.md) cover Vite, webpack, Next, Nuxt, and Astro; [UI-core-only consumption](./docs/UI_CORE_ONLY.md) needs neither Solid nor WASM.
- [Architecture](./docs/ARCHITECTURE.md) explains the layering, data flow, and backend-port contract.
- [Architecture decisions](./docs/decisions/) records the decisions behind worker boundaries and engine behavior.
- Package-level READMEs describe [the UI core](./excel/spreadsheet-ui-core/README.md), [the Solid integration](./excel/solid-excel/README.md), and [the demo site](./excel/excel-site/README.md).

## Maintainer and response expectations

This is a single-maintainer project ([@allroad88888888](https://github.com/allroad88888888)) without a paid support SLA. Realistic expectations:

- Bug reports and questions ([issues](https://github.com/allroad88888888/einfach-excel/issues) / [discussions](https://github.com/allroad88888888/einfach-excel/discussions)): best-effort first response within **7 days**; reproducible engine-correctness bugs get priority.
- Pull requests: best-effort first review within **14 days**; small focused PRs move much faster than large ones.
- Security reports: see [SECURITY.md](./.github/SECURITY.md) — use private vulnerability reporting, not public issues.
- Mixing different versions of `@einfach/*` packages is unsupported — they version as a fixed group; upgrade all five together (see [Release status and stability](#release-status-and-stability)).

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for code style, changesets, and documentation conventions.

## License

[MIT](./LICENSE)
