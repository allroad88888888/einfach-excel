---
title: Only calculate what is needed
summary: A sparse whole-column formula should visit real cells, not materialize a million-cell rectangle.
---

## Try this

1. Navigate deep into the data without filling unused cells.
2. Change an input and inspect the recalculated summary.
3. Compare the nominal column range with populated rows.

## How it works

The formula engine keeps sparse references sparse. Range materialization is reserved for results that must actually land as an array, so a wide-looking formula does not imply a wide allocation.
