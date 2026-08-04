---
title: Extend formulas without faking async work
summary: Register host functions and let an in-flight calculation visibly remain busy until its promise resolves.
---

## Try this

1. Enter a custom function into a formula cell.
2. Observe the busy state while asynchronous work is pending.
3. Change an argument and let the worker recalculate the result.

## How it works

Custom formula registration is a host-to-engine contract. The UI reflects engine state instead of inventing a client-only loading indicator, so errors and asynchronous results share one formula lifecycle.
