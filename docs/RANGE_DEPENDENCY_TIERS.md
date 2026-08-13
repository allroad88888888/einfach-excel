# Range Dependency Tiers

This note records the current source-backed rule for selecting range
dependencies during a formula read. It is deliberately limited to tier choice
and invalidation roots; it is not a general boundedness or performance
contract.

## Selection inputs

`range_geometry_bounds` normalizes a range and clamps both axes to Excel's
sheet limits before the tier helpers count cells, bands, or columns. A row band
is `row / 256`; a band root is keyed by `(column, row_band)`.

| Input                     | Current source rule                   |
| ------------------------- | ------------------------------------- |
| Tier-A cell limit         | `<= 256` cells                        |
| Row-band height           | 256 rows                              |
| Row-band dependency limit | `<= 4,096` `(column, row_band)` roots |
| Column dependency limit   | `<= 4,096` column roots               |

Source: `excel/rust/excel-core/src/sheet_range_tiers.rs:9-15,44-85`.

## Dependency selection

The formula provider calls `depend_range_geometry_epochs` before walking the
range. It then reads present members through cell facades in every tier. The
additional dependency mechanism is selected in this order:

| Tier                | Selection                                                                      | Dependency recorded                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A — member facades  | Normalized cell count is `<= 256`.                                             | Every absent member is read through its facade; present members are also read through their facades during the range walk. No geometry epoch is added. |
| B — row-band epochs | More than 256 cells and the number of `(column, row_band)` keys is `<= 4,096`. | One epoch per covered column and 256-row band.                                                                                                         |
| C — column epochs   | Tier B did not apply and the inclusive column count is `<= 4,096`.             | One epoch per covered column.                                                                                                                          |
| D — sheet epoch     | Tier B did not apply and the column count exceeds 4,096.                       | The one sheet epoch.                                                                                                                                   |

The checks are sequential: a range qualifies for Tier C only after exceeding
the row-band-root limit, and Tier D only after exceeding both geometry limits.
This is the implementation's dependency-selection order, not a statement
about evaluation cost.

Source: `excel/rust/excel-core/src/sheet.rs:1474-1502,1642-1658`.

## Invalidation roots

The three geometry epoch families are created lazily when a formula records a
Tier B, C, or D dependency. On a membership-changing write, the sheet bumps
already-materialized roots touching that address: its row-band root, its
column root, and the sheet root. A missing root is not created just to be
bumped. The normal write paths call this check only when the address's range
membership changes.

Source: `excel/rust/excel-core/src/sheet.rs:1456-1472,2014-2040`;
`excel/rust/excel-core/src/sheet_facade.rs:84-119`;
`excel/rust/excel-core/src/sheet_write_value.rs:97-100`.

## Checked evidence

`range_store_edges.rs` exercises the two directly observable cases below:

- A small `A1:A2` formula records its dependency on an empty member facade,
  then re-evaluates after that member receives a value.
- A large `A1:A300` formula materializes a row-band epoch and re-evaluates
  after a member in that band changes. The `A1:A5000` case observes 20
  materialized row-band roots.

These tests do not directly exercise the Tier C column threshold or Tier D
sheet fallback. Their selection rules above are verified from the live branch
structure in `depend_range_geometry_epochs`, not inferred from test results.

Source: `excel/rust/excel-core/src/sheet_tests/range_store_edges.rs:8-104,123-143`.
