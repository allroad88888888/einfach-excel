# Scale architecture

This page explains how four existing mechanisms divide responsibility when a
workbook has a large address space. It is a reader's guide to current code
facts and contracts, starting from the source-backed
[scale facts](SCALE_FACTS.md). It does not introduce a new runtime layer or a
new capacity claim.

## The four layers

| Layer                      | Owns                                                     | Does not own                                                                   |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Sparse storage             | Stored cell and formula records                          | Every geometric blank in a range                                               |
| Tiered range dependencies  | The invalidation roots selected for a formula range      | A materialized display or an operation payload                                 |
| Bounded display projection | Validated display data for one requested rectangle       | Workbook truth, formula caches, dependency graphs, or a full-workbook snapshot |
| Range-native operations    | The choice to send an oversized selection as a rectangle | A universal fallback that expands every rectangle into addresses               |

The layers meet at explicit boundaries. Storage establishes which records exist;
dependency selection records how a formula range should observe changes;
projection exposes display data for a requested rectangle; and commands choose
a range operation when an address grid would exceed that command's limit. A
layer may use a rectangle without taking ownership of all cells in that
rectangle.

## 1. Sparse storage: records, not the whole grid

The [sparse storage model](SPARSE_STORAGE_MODEL.md) describes `RowMajorMap` as
a row-keyed, column-keyed index of stored addresses. Range traversal is bounded
to the requested rows and columns, then emits only stored entries. Formula
scanning merges literal and formula addresses while preserving the range's
geometric meaning for consumers that need positions or blank cardinality.

This is the workbook-state layer. Its job is to distinguish a stored record
from a geometric blank; it does not declare a memory limit for a workbook or a
cost for reading a range.

## 2. Tiered dependencies: choose invalidation shape from range geometry

The [range dependency tiers](RANGE_DEPENDENCY_TIERS.md) describe the current
selection order for formula range dependencies. Small ranges use member
facades. Larger ranges can use row-band epochs, then column epochs, before the
sheet epoch is the fallback when the preceding geometry limits do not apply.
The relevant epoch objects are created only when a dependency needs them.

This layer tracks observation and invalidation roots; it neither changes which
cell records storage owns nor produces a UI snapshot. Its limits are source
routing rules, not a recalculation-time or invalidation-volume promise.

## 3. Bounded display projection: a display-only rectangle

The [projection boundary contract](PROJECTION_BOUNDARY_CONTRACT.md) defines a
request/result boundary for a visible viewport or an explicit range. Requests
are validated before they start, and a result must match its request identity,
rectangle, and requested revision. Returned cells must stay inside that
rectangle, and the result cannot contain more cells than its rectangle permits.

Projection owns current display data only. It is deliberately not the fact
store, formula cache, dependency graph, or an offscreen/full-workbook sparse
snapshot. This boundary keeps a display request separate from the workbook and
dependency layers beneath it.

## 4. Range-native operations: preserve the rectangle at command time

The [boundedness capability contracts](BOUNDEDNESS_CONTRACTS.md) record the
selection rules for clear, formatting, and clipboard actions. Above each
operation's configured address-grid limit, the UI attempts the corresponding
backend rectangle capability: `clear_range`, `set_format_range`, or range TSV
export. Address expansion itself returns `null` above its configured limit.

Backend capabilities are optional. An oversized clear or formatting request
whose backend lacks the required range capability is explicitly refused; an
oversized copy without a range TSV export returns `null`. The UI does not imply
that every backend supports these operations, and it does not silently expand
an unsupported oversized rectangle into per-cell work.

## Reading the architecture correctly

These four items are mechanisms and contracts, not measurements. They make no
performance, memory, throughput, network, transport, or production-SLA claim.
In particular, the architecture does not establish a workbook size limit, a
recalculation duration, a rendering duration, a network payload size, or
backend availability. Those conclusions require separately defined scenarios
and reproducible measurements.

For the precise current code citations, use [scale facts](SCALE_FACTS.md). For
the obligations and exclusions at each boundary, use the linked contract pages
above rather than inferring stronger claims from this synthesis.
