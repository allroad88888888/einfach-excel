# Advanced conditional formatting

Open **Conditional formatting**, choose Color scale, Data bar, or Icon set, then set its thresholds. The existing Applies to field accepts disjoint ranges separated by commas. Save changes the native rule once; Cancel and Escape discard only the dialog draft.

## Threshold semantics

| Type | Native meaning |
| --- | --- |
| Automatic | Existing color-scale min/max and median midpoint; automatic data bars retain their shared zero axis. Icon thresholds default to 33% and 67%. |
| Lowest value / Highest value | Minimum / maximum finite numeric member across all applied ranges. |
| Number | A finite numeric constant. |
| Percent | Linear position from the full-range minimum to maximum, from 0 to 100. |
| Percentile | Inclusive percentile of sorted finite numeric members: position `(n - 1) × p / 100`, interpolated between adjacent members. |
| Formula | A Rust spreadsheet formula returning a finite number, evaluated once in the first range’s top-left cell context. |

Blank cells, text, booleans, and errors do not enter the numeric domain. Formula results and spill members do. Hidden or offscreen numeric cells continue to contribute; scrolling does not redefine the rule domain. Number thresholds clamp color and bar output to the specified endpoints. Choosing an explicit data-bar endpoint uses that endpoint; Automatic retains the existing zero-inclusive behavior.

Invalid numeric drafts, percentages outside 0–100, and malformed formulas reject before rule/history mutation. Runtime formula errors, nonnumeric formula results, or resolved endpoints in the wrong order suppress that visual rule for the current projection. Other rules still apply. A changed formula dependency is reevaluated on the next native projection.

## Three-band icons

Three arrows, three traffic lights, and three flags use the same native thresholds. Values below the lower threshold receive the low icon, values equal to or above the lower threshold receive the middle icon, and values equal to or above the upper threshold receive the high icon. Reverse icon order changes the selected icon after native band calculation. Show icon only hides the displayed text while preserving the stored value, formula bar, and accessible text.

Icons combine with the effective highlight foreground/background. A higher-priority matching Stop if true rule prevents lower icons, bars, and scales. Higher-priority icon rules win their icon slot. Existing rule edit, copy, enable/disable, reorder, delete, undo, and redo use the same rule ID/history path.

## Ownership and persistence

`AdvancedConditionalFormatFields` reads the Core native editor draft and dispatches `runNativeConditionalFormatAtom`. Save uses the existing `conditionalFormat.change` Worker command and WASM history methods. Rust resolves numeric statistics, threshold formulas, priority, and icon metadata before the UI receives a visible projection. React renders returned metadata only.

Rule JSON adds optional threshold fields; existing files without those fields retain their previous result. Native snapshots/history keep original rules. Display colors, bar geometry, and `conditionalIcons` never become base cell formatting, clipboard formatting, or format-painter input. Row/column structural edits and worksheet reference rewrites update threshold formulas through the existing rule/history path.

## Verification

Native integration: `cargo test --manifest-path excel/rust/excel-core/Cargo.toml --test advanced_conditional_format`.

Core: `pnpm --filter @einfach-excel/spreadsheet-ui-core test test/advanced-conditional-format`.

React controls: `pnpm --filter @einfach-excel/react-excel test test/workbook/advanced-conditional-format`.

Persistent real Worker/WASM DOM scenarios live in `e2e/advanced-conditional-format/`. Each operation runs at 1280px and 390px; the shared integration owner executes them after rebuilding lite/full WASM and merging messages. The lifecycle suite captures English/Chinese desktop/narrow screenshots. Unit mock transport tests verify command shape only; they do not substitute for native or browser evidence.
