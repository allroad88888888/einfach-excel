---
title: Calculate the visible result—not every formula
summary: A requested result follows off-screen and cross-sheet dependencies automatically; formulas outside that chain stay unevaluated.
---

## Try this

1. Start on Summary: its visible results are the only formula values requested.
2. Follow `Summary → Model → Inputs` to inspect the automatically resolved dependency chain.
3. Open Unused only when you want its 64 imported formulas to be evaluated.

## How it works

The seed bulk-imports every formula without evaluating its value. Reading the Summary projection activates its ordinary formulas, and the workbook provider follows required references across sheets. Formula values outside the requested results and their dependency chain remain cold until read.
