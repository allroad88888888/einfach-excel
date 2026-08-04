# @einfach/excel-site

Static documentation and real-engine demo site for the Einfach spreadsheet stack. Astro renders readable HTML;
Solid islands mount `@einfach/solid-excel` on the Rust/WASM Worker backend only where a live grid is needed.

## Local development

From the repository root, install dependencies and build the Worker bindings once:

```bash
pnpm install
npm run ensureWasm
```

Then run the site from this directory:

```bash
npm run dev
```

The production build also generates TypeDoc Markdown from the public `spreadsheet-ui-core` and `solid-excel`
entry points:

```bash
npm run check:docs
npm run check:solid
npm run build
```

## Deployment

`.github/workflows/pages.yml` builds WASM and publishes `dist/` to GitHub Pages on pushes to `main`. The production
base is `/einfach-excel`; local builds use `/`. Use `sitePath()` for internal browser links and `publicUrl()` only for
canonical publication files such as the sitemap and AI indexes.

## Content ownership

- `src/content/demos/{en,zh}/` owns readable demo narratives.
- `src/data/source-projection.ts` reads implementation-owned contracts for the documentation pages.
- `src/islands/` owns browser-only spreadsheet behavior; UI state inside an island uses Einfach atoms.
- `docs/archive/` contains completed planning records; current architectural reasoning belongs in the ADR directory.
