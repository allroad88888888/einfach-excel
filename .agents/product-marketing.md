# Product Marketing Context

**Document version:** v2
**Last updated:** 2026-08-21

> Auto-drafted from the repository, published package metadata, and live-demo contracts.
> Customer quotes, adoption metrics, and commercial goals still need owner validation.

## Product Overview

**One-liner:** Einfach Excel is an open-source spreadsheet engine that calculates only the formulas requested results need, while resolving off-screen and cross-sheet dependencies automatically.

**What it does:** Visible projections trigger ordinary formula values on demand. The engine follows the required dependency chain beyond the viewport or into other sheets, while unrelated formula values remain unevaluated. A framework-agnostic UI core, bounded projections, and an optional Worker-hosted Rust/WASM engine complete the product surface.

**Product category:** Embeddable spreadsheet UI and workbook engine.
**Product type:** Open-source developer infrastructure and npm packages.
**Business model:** MIT-licensed; no paid plan or commercial support offer is documented.

## Target Audience

**Target companies:** SaaS products and internal-tool teams building spreadsheet-like workflows.
**Decision-makers:** Frontend/platform engineers, technical leads, and product engineers evaluating build-versus-buy choices.
**Primary use case:** Embed an editable spreadsheet workflow while keeping authoritative data and computation boundaries explicit.

**Jobs to be done:**

- Give operations, finance, or sales users a familiar editable work surface.
- Calculate visible results without evaluating unrelated workbook formulas.
- Keep large-sheet rendering bounded to the visible worksheet projection.
- Run workbook calculation away from the browser main thread.
- Connect spreadsheet interaction to an existing backend or data model.

**Use cases:** Forecasting workbenches, data cleanup, governed form hand-offs, custom formulas, collaboration surfaces, and large-sheet browsing.

## Personas

| Persona             | Cares about                  | Challenge                                          | Value we promise                                                     |
| ------------------- | ---------------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| Product engineer    | Shipping the workflow        | Spreadsheet behavior is expensive to rebuild       | A working UI surface with focused demos and a five-minute Solid path |
| Frontend lead       | Responsiveness and ownership | Full workbooks can trigger irrelevant formula work | Demand-driven formulas, bounded projections, and Worker computation  |
| Platform architect  | Data boundaries              | Turnkey spreadsheet widgets can own too much state | A typed backend port that leaves workbook authority with the host    |
| Technical evaluator | Evidence and risk            | Marketing claims are hard to trust                 | Running demos, source links, contract docs, and explicit limitations |

## Problems & Pain Points

**Core problem:** Conventional spreadsheet flows can treat every installed formula as calculation work even when the user only needs one visible result. Product teams need the requested dependency chain—not unrelated workbook formulas—to drive evaluation.

**Why alternatives fall short:**

- A generic data grid may not provide workbook behavior or a formula engine.
- A monolithic spreadsheet component may impose its own workbook and persistence model.
- An in-house build turns selection, editing, formulas, clipboard, history, and accessibility into a long maintenance program.

**What it costs them:** Engineering time, main-thread contention, duplicated business state, and uncertain integration risk.
**Emotional tension:** Teams want spreadsheet familiarity without inheriting an opaque subsystem.

## Competitive Landscape

**Direct:** Univer and Handsontable are dated evidence-led comparison references in this repository; no superiority claim is established.
**Secondary:** Data-grid libraries plus a separate calculation service.
**Indirect:** A bespoke grid/workbook implementation or embedding an external spreadsheet product.

## Differentiation

**Key differentiators:**

- Visible results evaluate ordinary formulas on demand; formula values outside the result's dependency chain remain unevaluated.
- Required dependencies are followed automatically through off-screen cells and across sheets.
- The UI asks for a bounded visible projection instead of assuming ownership of a full geometric grid.
- Workbook data and mutations live behind an explicit backend port.
- The published Solid path can place Rust/WASM formula work in a Web Worker.
- Static, crawlable documentation links each claim to a running demo, contract, or source file.

**How we do it differently:** Formula inners are lazy and record the cells they actually read; the workbook provider resolves those reads across sheets while the visible projection defines the requested results.
**Why that's better:** A user can request a visible answer without turning every formula in the workbook into immediate work, while still receiving every dependency the answer requires.
**Why customers choose us:** They value control, inspectability, and an open-source starting point more than a closed all-in-one widget.

## Objections

| Objection                     | Response                                                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| “We use React or Vue.”        | The complete published UI binding is Solid today. React and Vue pages are controlled-projection references, not published adapters. |
| “Is the API stable?”          | The packages are at `0.1.0`; minor releases may break compatibility. Pin the minor and read each changelog.                         |
| “Can it handle our workload?” | Use the focused demos and reproducible checks. Do not infer a production SLA from demo measurements.                                |
| “Who supports it?”            | It is a single-maintainer project with best-effort response targets and no paid SLA.                                                |

**Anti-persona:** Teams that require a mature React/Vue adapter, contractual support, a hosted collaboration service, or a drop-in Excel clone today.

## Switching Dynamics

**Push:** A homegrown grid is growing into a workbook engine, or an embedded component hides data and performance ownership.
**Pull:** Demand-driven formulas, automatic cross-sheet dependency traversal, open source, bounded rendering, and off-main-thread calculation.
**Habit:** Existing grid code, framework standardization, and fear of replacing a familiar vendor.
**Anxiety:** Pre-1.0 stability, Solid-only formal binding, integration effort, and unsupported production assumptions.

## Customer Language

**How they describe the problem:** No verified verbatim customer language is available yet.
**How they describe us:** No verified customer quote is available yet.
**Words to use:** calculate on demand, requested result, dependency chain, off-screen, cross-sheet, unevaluated, bounded projection, Worker, running demo.
**Words to avoid:** seamless, blazing fast, enterprise-ready, Excel replacement, production-grade, unlimited.

| Term               | Meaning                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| Bounded projection | The exact worksheet rectangle requested and accepted by the UI          |
| Backend port       | The contract through which the UI reads projections and sends mutations |
| Workbook engine    | The owner of cell values, formulas, dependencies, and calculation       |
| Requested closure  | The visible results plus every formula and input they actually read     |
| Formal binding     | A published framework integration intended for application use          |

## Brand Voice

**Tone:** Calm, technically confident, and evidence-led.
**Style:** Direct, specific, benefit-first, and explicit about boundaries.
**Personality:** Open, rigorous, practical, understated.

## Proof Points

**Metrics:** The live performance scenario seeds 100,000 data rows; this is a demo scope, not a capacity promise.
**Availability:** Five fixed-group packages were published to npm at `0.1.0` on 2026-08-17.
**License:** MIT.
**Customers:** No customer logos are documented.
**Testimonials:** No verified testimonials are documented.

| Value theme               | Proof                                                                  |
| ------------------------- | ---------------------------------------------------------------------- |
| Calculate only demand     | Bulk-imported formula values wait for reads; lazy inners track reads   |
| Follow required inputs    | The workbook evaluation provider resolves off-screen/cross-sheet refs  |
| Inspect before adopting   | Live workbench, viewport, formula, and backend demos link to source    |
| Keep work bounded         | Projection contracts validate requested rectangles                     |
| Keep UI responsive        | The Solid worker path runs Rust/WASM workbook work off the main thread |
| Start from a real package | `@einfach/solid-excel@0.1.0` is available from npm                     |

## Goals

**Business goal:** Assumption — increase qualified open-source evaluations and package adoption.
**Conversion action:** Primary: open the demand-driven formula demo. Secondary: try the full workbench or follow the five-minute npm quickstart.
**Current metrics:** Unknown; no analytics, conversion rate, stars target, or install target is documented.

## Changelog

- v2 (2026-08-21) — Made demand-driven formula evaluation and automatic off-screen/cross-sheet dependency traversal the primary position.
- v1 (2026-08-21) — Initial codebase-derived positioning, evidence boundaries, objections, and conversion assumptions.
