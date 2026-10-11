# spreadsheet-ui-core / tables

## 当前 React 主线

基础操作：创建 Table、重命名 Table、转换为普通区域。第一行作为表头，Rust 规范化空白／重复列名。
汇总操作：显示汇总行、设置列汇总函数、隐藏汇总行；继续使用同一个 command atom 和 Worker 命令。
列名操作：Tables 面板修改列名、直接编辑表头；两种入口最终调用同一个 Rust 列名历史操作。

调用链：`TableTools` → `runNativeTablePanelAtom` → `table.change` → WASM `change_table`
→ Rust `WorkbookHistory` → 同次返回的可见区投影。一次操作只有一次 Worker 往返；撤销仍走已有原生历史。

- `native-types.ts`：原生目录与命令载荷；只校验响应结构，不复制 Rust 的名称或公式规则。
- `native-panel.ts`：弹窗草稿、忙碌与错误状态；Table 目录直接读取 `projection.result.tables`。
- `../rust-workbook/table-commands.ts`：画布坐标校验及原生命令分发，不保存注册表。
- 初始 Table 在全部单元格导入后创建，表头来自真实 Rust 数据；启动结束统一清除历史。
- 汇总函数从 Rust 中的真实公式派生为 `totalFunctions`，不写入 Table 持久化元数据或第二份函数配置。
- 修改某列函数只写该单元格；显示／隐藏同时修改表范围与汇总行内容，均由 Rust 原生历史记录。
- 列名变更同时更新表头文字、注册项和引用消费者，一次撤销整体恢复；不在 React 改公式文本。
- 普通单格输入与表头输入均由 WASM `set_cell_input` 记录原生历史，Worker 不再套单格历史事务。
- 名称管理器的 Tables 列表直接读当前投影；定位复用切表／选区／滚动 atoms，不写原生数据。

创建／改名／转换与汇总行已验收。列名编辑及定位已接线、正在验收，Table 样式及其余 #32 计划仍待后续批次。
完整验收状态见 [React 功能进度](../../../react-excel/FEATURE_PROGRESS.md)。

## 历史接口记录（非当前 React 运行路径）

以下 `types.ts` / `commands.ts` 的 port、目录缓存及能力探测属于旧实现，React 不使用它们。
下面的“尚未实现”与兼容描述仅指旧路径，不代表上方 Rust-only 主线。

Excel Table (structured references, totals) — parity #32,
`excel/solid-excel/docs/online-excel-parity/design-excel-table.md`.

Canonical ownership: the **engine registry is the single source of truth**
for a table's geometry and columns (CANONICAL_OWNERSHIP §3 #32). UI core
holds no second copy — it re-reads through the `listTables` / `getTable`
backend ports and treats every descriptor as a read-only view fact.

## Contents (adapter bridge — second slice)

`types.ts` — framework-neutral `SpreadsheetTableDescriptor` plus the
request / result / structured-reject shapes for the six table CRUD backend
ports (`createTable` / `renameTable` / `renameTableColumn` / `deleteTable` /
`listTables` / `getTable`), and the `TablesControllerPort` structural subset
the commands consume. The Rust wire pipeline and worker adapter live in
`excel/spreadsheet-ui-core/src/rust-worker/`; the TS parity runtime remains in
`excel/solid-excel/src/adapter/`.

`commands.ts` — the create-table command layer:

- **source** — `tableCatalogBackingAtom`, a bounded read-through cache of
  the last `listTables` result (cap `MAX_TABLE_CATALOG_ENTRIES` = 256,
  aligned with the engine). UI core stores no second copy of geometry; the
  engine registry stays canonical (CANONICAL_OWNERSHIP §3 #32).
- **derived** — `allTablesAtom` (every table), `tablesForSheetAtom` (a
  selector `(sheetId) => descriptors`), `createTableSupportedAtom`
  (`createTable` port presence), `tableDiagnosticAtom`,
  `lastCreatedTableNameAtom`.
- **command** — `captureTableCapabilityAtom`, `refreshTableCatalogAtom`,
  `runCreateTableAtom` (capability split + structured-reject mapping +
  local invalid-selection gate + catalog refresh on apply),
  `clearTableDiagnosticAtom`.

Totals row (parity #32 T6) — `setTableTotalsRow` / `setTableTotalFunction`
backend ports gated by the same `structuredTables` witness:

- **derived** — `toggleTableTotalsSupportedAtom` (`setTableTotalsRow` port
  presence, gates the Data-menu totals entry), `lastToggledTableTotalsAtom`
  (`{ name, hasTotals }` visible-badge witness).
- **command** — `runToggleTableTotalsAtom` (`{ source, name, enabled }`:
  capability split + dispatch + catalog refresh on apply with the grown
  range + `hasTotals` + structured-reject mapping for `totals-row-blocked` /
  `no-totals-row` / `invalid-totals-function`),
  `runToggleTableTotalsAtSelectionAtom` (resolves the table under the active
  cell via `findTableForCell`, else a `no-table-at-selection` diagnostic),
  `runSetTableTotalFunctionAtom` (per-column aggregate).
- **helper** — `findTableForCell(tables, coord)` (framework-neutral A1-range
  containment used by the totals UI entry).

Rename / delete (design §9, parity #32 T7) — definition-level lifecycle on
the `renameTable` / `renameTableColumn` / `deleteTable` ports:

- **derived** — `renameTableSupportedAtom`, `renameTableColumnSupportedAtom`,
  `deleteTableSupportedAtom` (port-presence witnesses that gate the Name
  Manager row affordances), `lastRenamedTableAtom` (`{ from, to }` applied
  witness), `lastDeletedTableNameAtom`.
- **command** — `runRenameTableAtom` (`{ source, name, newName }`),
  `runRenameTableColumnAtom` (`{ source, name, oldColumn, newColumn }`),
  `runDeleteTableAtom` (`{ source, name }`). Each one: capability split by
  port presence, single-flight lane, structured-reject → readable diagnostic
  (rename/delete-flavored copy via `TABLE_RENAME_REJECTION_MESSAGES` /
  `TABLE_DELETE_REJECTION_MESSAGES`, falling back to the shared
  create-flavored map), throw → `outcome-unknown`, and a catalog refresh
  from the canonical registry on apply.
- **local pre-validation (zero transport)** — `isValidTableName` mirrors the
  engine's `[A-Za-z_][A-Za-z0-9_]*` / 1..255 name shape and
  `isCellRefLikeTableName` mirrors `name_is_cell_ref_like`, so an empty,
  malformed, cell-ref-like, or unchanged (`name-unchanged`) new name is
  rejected before a worker round-trip. The engine stays canonical and
  re-asserts every rule; the local gate only saves the trip. Column display
  names are free text and are NOT held to the table-name shape.

Feature degradation: when the host backend omits these ports the Data-menu
"Create table" entry hides through the standard method-presence contract —
the TS worker runtime declares `structuredTables: false` (fail-closed) and
the static backend does not implement them, so both correctly hide the
surface (`createTableSupportedAtom` reads `false`).

## Not here yet (later slices, design §9 / §13)

- Table rename / delete UI, the create-table dialog (this slice creates on
  the current selection with an engine-auto name; a name field is a later
  dialog slice). The totals-function dropdown is backed by
  `runSetTableTotalFunctionAtom` but has no dedicated UI surface yet — the
  Data-menu entry toggles the row only (default SUM aggregate).
- Name Manager read-only "Tables" section (design §9). Deferred:
  `allTablesAtom` + `refreshTableCatalogAtom` are exported, but wiring a
  refresh-on-open into `SpreadsheetNameManagerDialog` plus a read-only
  section and its tests is a separate slice, not a low-cost add-on here.
- SUBTOTAL hidden-row push (`setEvalHiddenRows`) — separate port family.
- Table lifecycle undo (design §11/§12 known gap: persistence and the
  snapshot primitive do not carry the table registry).
