# Homepage prototype · 2026-08-20

Open `landing-v2.html` in a browser. It is intentionally independent from Astro so the direction can be reviewed before it replaces any production route.

## The problem it solves

The current homepage presents a long technical statement, a live grid, a competitor-evidence table, and a demo directory at the same level. That makes the product look like a project notebook instead of an opinionated developer product.

The proposed homepage has one job: help an engineer decide whether Einfach Excel deserves a hands-on evaluation.

## Direction: a calm technical workbench

- The first visual is a believable worksheet, not an abstract architecture diagram.
- The palette uses paper, ink, and a precise blue selection state; green is reserved for live and success signals rather than covering the whole product.
- The layout resembles a well-made instrument panel: compact labels, strong dividers, useful controls, and no invented growth metrics.
- The visual system is built from two line weights, three surface shades, an eight-pixel spacing rhythm, and one 10px radius.

## Proposed information architecture

1. **Hero / live worksheet** — product thesis, one primary action, and tangible proof.
2. **Engineering guarantees** — bounded projection, worker computation, adaptable UI core.
3. **Evaluation paths** — demos organized around a developer's first task.
4. **Integration proof** — the smallest credible code sample plus framework links.
5. **Docs footer** — documentation, API, architecture, source.

## Review questions

1. Does the paper-and-ink workbench feel sufficiently different from the common green spreadsheet clone?
2. Is the homepage's primary promise the right one: embedded product workflows rather than standalone spreadsheet replacement?
3. Should the primary CTA open the workbench demo, or should it go directly to installation documentation?

## Files

- `landing-v2.html` — semantic prototype structure.
- `landing-v2.css` — visual foundation, masthead, and hero.
- `landing-v2-workbench.css` — worksheet preview.
- `landing-v2-content.css` — product proof cards.
- `landing-v2-evaluation.css` — task-based demo selector.
- `landing-v2-integration.css` — code integration proof.
- `landing-v2-footer.css` — closing navigation.
- `landing-v2.js` — small evaluator-path interaction.
