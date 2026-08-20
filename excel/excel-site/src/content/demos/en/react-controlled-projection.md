---
title: React controlled projection
summary: A local React island renders fixed cells through the public provider, grid, selection, and pointer APIs.
---

## Try this

1. Drag from one cell across another cell.
2. Read the selected range directly below the grid.
3. Start another drag to replace the range.

## How it works

The caller owns this fixed 4×4 projection, the deterministic backend object, and an isolated Einfach store. The grid receives cells and the selected range as controlled inputs; the pointer-selection hook writes the range to that store.

This local demo does not fetch, persist, edit, or calculate workbook data. Its backend methods throw if called so the displayed projection remains explicit.

## Availability boundary

The React adapter is private repository source, not a published npm package or a production integration path. Read the React adapter source guide before treating this controlled example as an application architecture.
