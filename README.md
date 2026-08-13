# Einfach Excel

[![CI](https://github.com/allroad88888888/einfach-excel/actions/workflows/ci.yml/badge.svg)](https://github.com/allroad88888888/einfach-excel/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Live demo](https://img.shields.io/badge/demo-live-0a7f5a.svg)](https://allroad88888888.github.io/einfach-excel/)

**Einfach Excel is a spreadsheet UI core with a bounded projection contract and a Rust/WASM workbook engine.**

[Explore the live demo](https://allroad88888888.github.io/einfach-excel/) · [中文文档](./README.zh-CN.md) · [Architecture](./docs/ARCHITECTURE.md) · [Contributing](./CONTRIBUTING.md)

## Why Einfach Excel?

Spreadsheet interfaces are deceptively hard: rendering, interaction, calculation, and data access need distinct ownership. Einfach Excel keeps the UI separate from the workbook implementation through explicit backend and projection boundaries.

Scale-related behavior is expressed as current code contracts rather than headline measurements:

- **Store records, not a geometric grid.** The workbook's row-and-column keyed storage and range traversal work from stored entries within the requested bounds.
- **Keep display data inside an explicit rectangle.** The UI core validates visible-viewport and explicit-range requests, then rejects results that do not match the request or exceed its rectangle.
- **Select range dependencies by geometry.** Formula ranges choose cell, row-band, column, or sheet invalidation roots through source-defined geometry rules.
- **Keep oversized commands rectangular.** Clear and formatting attempt backend range capabilities above their address-expansion limits; unsupported requests are refused instead of expanded into cell actions.

Read [scale facts](./docs/SCALE_FACTS.md) for code citations and [scale architecture](./docs/SCALE_ARCHITECTURE.md) for layer boundaries. These mechanisms make no performance, memory, capacity, transport, or production-SLA claim.

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

### Release status

This project is currently available as repository source and is in a pre-release stage. No npm-published package has been verified for offline installation. Use a repository checkout for the documented local build and verification paths.

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

- [Architecture](./docs/ARCHITECTURE.md) explains the layering, data flow, and backend-port contract.
- [Architecture decisions](./docs/decisions/) records the decisions behind worker boundaries and engine behavior.
- Package-level READMEs describe [the UI core](./excel/spreadsheet-ui-core/README.md), [the Solid integration](./excel/solid-excel/README.md), and [the demo site](./excel/excel-site/README.md).

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for code style, changesets, and documentation conventions.

## License

[MIT](./LICENSE)
