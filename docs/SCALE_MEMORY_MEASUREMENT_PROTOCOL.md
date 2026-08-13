# Scale memory measurement protocol

This protocol defines how to report memory observations per 10,000 stored
non-empty cells. It is a measurement procedure, not an implementation,
benchmark result, capacity statement, or performance commitment.

## Measurement unit

The denominator is the number of **stored, non-empty cells** in the input
workbook after it has been constructed. Geometric blank cells inside a used
rectangle are excluded. Cells that are merely visible, selected, formatted, or
addressable without a stored non-empty value are also excluded.

For an observed memory delta `D` bytes and a stored non-empty-cell count `N`,
report:

```
bytes per 10,000 stored non-empty cells = D * 10,000 / N
```

`N` must be greater than zero. Report the unrounded `D` and `N` alongside any
rounded per-10,000 value. Do not substitute row count, column count, used-range
area, file size, DOM node count, or a nominal worksheet capacity for `N`.

## Required scenario record

Each measurement series records all of the following before any result is
interpreted:

- repository revision and the command or harness revision;
- input construction procedure and the exact stored non-empty-cell count;
- data shape: sheet count, populated rows and columns, value types, formula
  presence, formula dependency shape, styles, merges, and geometric blank area;
- operation boundary, such as construction, import, first render, scroll, or
  recalculation, including what begins and ends the observation;
- runtime, browser when applicable, OS, CPU model, available memory, process
  architecture, build mode, and relevant runtime flags;
- measurement API or tool, its units, and its process or browser scope; and
- baseline, warmup count, raw samples, summary calculation, failures, and any
  retries.

The record must identify one stable scenario. Changing either the data shape,
operation boundary, runtime configuration, or measurement scope creates a new
series.

## Collection procedure

1. Start from a fresh, stated process or browser state. Record the baseline
   memory observation before constructing or loading the workbook.
2. Run the stated warmup procedure. Warmup may initialize code, WASM, caches,
   fonts, or rendering; it does not enter the reported sample set.
3. For every retained sample, repeat the same operation from the stated reset
   condition, wait for its declared completion condition, then record memory
   using the stated tool.
4. Compute each sample delta using the baseline defined for that sample. If a
   shared baseline is used, state why it remains valid for the series.
5. Preserve each raw observation, baseline, calculated delta, `N`, and failure
   reason in a reviewable artifact. Report the sample count and calculation used
   for any summary; never publish a summary without raw samples.

A failed sample stays in the record with its reason. It may be rerun only as a
newly identified sample, not silently replaced.

## Attribution limits

RSS is process-resident memory, not a component-level allocation counter. A
JavaScript or browser-process RSS delta can include runtime heaps, JIT code,
garbage-collection timing, native libraries, fonts, graphics resources,
allocator behavior, and other work in that process. It cannot by itself be
attributed solely to workbook storage, formulas, rendering, or JavaScript.

Likewise, a process that instantiates WASM may include WASM linear memory,
compiled code, host bindings, allocator state, and JavaScript-side objects in
the same RSS observation. Report the measurement scope as combined process RSS
unless a separate tool provides a documented, independently scoped value. Do
not subtract or label a JS/WASM portion as exact without that tool and its
method being recorded.

Garbage collection, asynchronous cleanup, shared pages, and operating-system
accounting can make deltas noisy or negative. Such values are observations, not
proof that a subsystem allocated, released, or retained an exact amount.

## Comparison rule

Per-10,000 values are comparable only when the series use the same operation
boundary, data shape, measurement scope, runtime configuration, baseline rule,
warmup procedure, sampling procedure, and denominator definition. In
particular, results from different sheet layouts, density, value types, formula
graphs, styling, merges, or geometric blank areas must not be ranked, averaged,
or used to claim one has lower memory cost than another.

When any of those conditions differs, publish the results as separate bounded
observations with their scenario records. This protocol supplies no universal
memory estimate or product-level capacity conclusion.
