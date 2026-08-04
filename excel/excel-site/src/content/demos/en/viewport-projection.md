---
title: Only draw what is visible
summary: Scroll a 100,000-row order sheet while the browser asks the worker for a small visible projection.
---

## Try this

1. Scroll several screens and keep the grid interactive.
2. Use the name box to jump to a distant cell such as F45000.
3. Edit a value and observe that the workbook stays in the worker.

## How it works

The UI sends viewport metrics to the backend port. The Rust/WASM workbook and its formulas remain in a Web Worker; the browser receives only the visible rows plus a small overscan window.
