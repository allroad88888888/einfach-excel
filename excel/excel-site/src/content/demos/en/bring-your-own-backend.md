---
title: Bring your own backend
summary: The static backend is intentionally isolated here to demonstrate the required port contract and graceful capability absence.
---

## Try this

1. Edit the small roster in memory.
2. Notice that the standard chrome still works.
3. Compare this lightweight host backend with the Worker/WASM demos.

## How it works

Only three backend methods are required. Optional capability ports enrich the UI when available; absent ports remove their corresponding commands rather than forcing a partial imitation.
