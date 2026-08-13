# AD-825 normalized worker payload measurement

## Boundary

This runbook records the normalized payload byte estimate for messages crossing
the current browser Worker boundary while opening a workbook with a chosen
number of populated cells. It does not measure structured-clone transfer bytes.
Browsers do not expose clone bookkeeping, message-port framing, scheduling, or
transport overhead as application-visible byte counts.

The metric therefore supports a bounded observation about actual message objects
in one recorded run. It does not support a claim about network bytes, public
package size, memory use, latency, throughput, performance, or an advantage over
another implementation.

## Method

`worker-wire-telemetry.ts` records every inbound worker message plus every
outbound message sent through `worker-post.ts`. Its method identifier is
`canonical-json-utf8-v1`:

1. Treat the wire object as JSON-like data.
2. Sort object keys recursively while preserving array order.
3. Omit object properties whose value is `undefined`.
4. Serialize the resulting canonical JSON without whitespace.
5. Count UTF-8 bytes in that text.

Values outside that JSON-like contract, such as functions, cyclic values, or
non-finite numbers, increment `unmeasurableMessageCount` instead of being
assigned a byte estimate. A valid run must report that count; it must not fold
unmeasurable messages into zero bytes.

The categories are `request`, successful `response`, failed `error`,
`cellsDirty` (`dirty`), `cellsHydrated` (`hydrated`), plus `unclassified` for
messages outside those shapes. The recorded counters use two directions:
`host-to-worker` and `worker-to-host`.

## Reproducible recording procedure

1. Record the repository revision, browser version, operating system, runtime
   mode, Worker entry, and the exact workbook fixture or generator revision.
2. State `N` as the populated-cell count, plus sheets, value mix, formulas, and
   opening action. Do not substitute address-space dimensions for populated
   cells.
3. Reset the telemetry counter immediately before the opening action.
4. Open the workbook and wait for the defined settled condition. State that
   condition, such as the first requested projection response plus all dirty or
   hydration events causally emitted by that opening action.
5. Capture the complete `WorkerWireTelemetrySnapshot` JSON as the raw artifact.
   Preserve the command or harness source that produced it.
6. Record the snapshot totals and each nonzero direction/category bucket below.
   Include `unmeasurableMessageCount`, even when it is zero.

## Observation record

No observation has been recorded by this document yet. Fill every field for an
E2 measurement; blank fields are missing evidence, not zero values.

| Field                                | Required value           |
| ------------------------------------ | ------------------------ |
| Verification date                    |                          |
| Repository revision                  |                          |
| Browser and version                  |                          |
| Operating system                     |                          |
| Runtime mode and Worker entry        |                          |
| Fixture or generator revision        |                          |
| `N` populated cells                  |                          |
| Sheets, value mix, and formula shape |                          |
| Opening action                       |                          |
| Settled condition                    |                          |
| Raw snapshot artifact locator        |                          |
| Method identifier                    | `canonical-json-utf8-v1` |
| Total messages                       |                          |
| Total normalized payload bytes       |                          |
| Total unmeasurable messages          |                          |
| Nonzero direction/category buckets   |                          |

## Interpretation limits

This record becomes an E2 observation only after a raw snapshot and all required
scenario fields are supplied. Even then, it is limited to the stated revision,
fixture, browser, and opening action. It is not a structured-clone byte total or
a network measurement, so it must not be used as evidence for remote-backend
costs or comparative claims.
