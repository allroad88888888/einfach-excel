# Projection boundary contract

The UI projection is the boundary that turns a viewport request, or an
explicit user-range request, into display data. It is not workbook state.
The authoritative module contract lives in
[`projection/README.md`](../excel/spreadsheet-ui-core/src/projection/README.md)
and the public types and commands live in
[`projection/types.ts`](../excel/spreadsheet-ui-core/src/projection/types.ts)
and [`projection/index.ts`](../excel/spreadsheet-ui-core/src/projection/index.ts).

## What crosses the boundary

- A visible request names one sheet, one rectangular window, and a non-zero
  safe request id. An explicit range request has the same identity fields but
  is for a user command rather than a viewport surface.
- Requests must have non-negative integer bounds, be non-empty, and pass the
  configured cell-count limit before they can start. A result must match its
  request's kind, sheet, id, rectangle, and any explicitly requested revision.
- A returned cell must lie inside that rectangle, and a result cannot contain
  more cells than its requested rectangle permits. These are boundary checks,
  not an assertion that the rectangle is densely populated.
- The display snapshot exposes only `idle`, `loading`, `ready`, or `error`,
  plus the current request, result, and error when present. Consumers receive
  it through the read-only `projectionSnapshotAtom`; commands own writes.

The contract tests pin copying request bounds, rejection before a backend read,
revision correlation, stale-result rejection, out-of-range-cell rejection, and
result-size rejection in
[`projection-contract.test.ts`](../excel/spreadsheet-ui-core/test/projection-contract.test.ts).

## Visible-window lifecycle

A visible-window request owns the display lifecycle. One visible backend
transport can be active and one newer visible request can wait behind it; a
newer queued request replaces the older queued request. A settled or rejected
request that no longer matches the active request is ignored as stale.

While a visible refresh is pending, its caller can opt into retaining the
previous display result. Without that opt-in, a new request clears the displayed
result while loading. Resetting clears the display projection, but does not
release an in-flight backend lane; late work must not restore the cleared
display. The lifecycle cases are covered in
[`projection-lifecycle.test.ts`](../excel/spreadsheet-ui-core/test/projection-lifecycle.test.ts).

Range requests use a separate, strictly busy lane. Their accepted result is
returned to the command that requested it; it is not a mechanism for replacing
the visible display snapshot.

## Deliberate non-ownership

Projection data is display data only. In particular, this boundary must not
become any of the following:

- the workbook fact store;
- a formula cache;
- a dependency graph; or
- an offscreen or full-workbook sparse snapshot.

It may hold the current display result, and a caller may explicitly retain a
previous visible result during its successor's loading state. That limited
display behavior does not authorize retaining cells merely because they were
visited earlier, or using projection state as the source of workbook truth.

This contract intentionally makes no cache-size, performance, latency,
throughput, or backend-transfer guarantee. Those properties belong to the
chosen backend and host integration, not to the projection boundary.
