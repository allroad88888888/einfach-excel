# @einfach/excel-site

Demo / marketing site for the einfach spreadsheet stack. It showcases the real
`@einfach/solid-excel` + `@einfach/spreadsheet-ui-core` components on top of the
Rust/WASM formula engine, and replaces `excel/showcase`.

## Dev quickstart

```bash
pnpm install
```

at the repo root, then from this directory:

```bash
npm run dev
```

Opens <http://127.0.0.1:4174>.

Demos backed by the Rust/WASM engine need the WASM bindings built once first —
run this at the repo root before starting the dev server:

```bash
npm run ensureWasm
```

This builds `excel/solid-excel/wasm-pkg/`.

## Build

```bash
npm run build
```
