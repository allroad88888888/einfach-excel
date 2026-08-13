---
title: Vue controlled projection
summary: A local Vue island renders fixed cells through the public provider, grid, selection, and pointer APIs.
---

## Try this

1. Drag from one cell across another cell.
2. Read the selected range directly below the grid.
3. Start another drag to replace the range.

## How it works

The caller owns this fixed 4×4 projection, the deterministic backend object, and an isolated Einfach store. The grid receives cells and the selected range as controlled inputs; the pointer-selection API writes the range to that store.

This local demo does not fetch, persist, edit, or calculate workbook data. Its backend methods throw if called so the displayed projection remains explicit.

## Availability boundary

This is pre-release repository source, not a published package or independently verified offline installation. It makes no support, compatibility, or performance promise.
