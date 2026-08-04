---
title: Load where you scroll
summary: Treat a remote sheet as addressable areas that may load, fail, expire, and reload independently.
---

## Try this

1. Move the viewport to request another region.
2. Retry a failed visible region.
3. Reload an expired area without resetting the workbook.

## How it works

The UI describes visible areas through backend ports. A production remote backend can expose loading and failure state while preserving the same grid contract used by the worker-backed demos.
