---
'@einfach-excel/react-excel': minor
---

Support React 19 alongside React 18.3, guard initial SSR rendering (`renderToString` without
`window` or `Worker`), fix Rspack/LightningCSS root reset specificity and `box-sizing` parity, and
widen `@einfach-excel/spreadsheet-ui-core` peer ranges for `0.x` evolution alongside the newly
public `@einfach-excel/xlsx` and 11 `@einfach-excel/plugin-*` packages (`0.1.0`). Also add
sub-second time and host `dateInputOrder` (`YMD`/`MDY`/`DMY`) parsing, internal workbook hyperlink
navigation and sheet-rename retargeting, local `.csv`/`.tsv`/`.txt` file import in Text to Columns,
remaining Go To Special locators (objects, same rules, all-level precedents/dependents), Copy As
merge/filter fidelity, chart refresh hit-filtering / dark surface / element double-click targeting,
and full XLSX round-trip fidelity for icon sets, threaded comments, internal links, sheet
protection, outlines, sheet visibility/tab colors, and text rotation.
