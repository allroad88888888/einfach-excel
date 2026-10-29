// ===========================================================================
// Excel Table UI-core command layer (design-excel-table.md §9 / §13 T7,
// parity #32)
//
// The engine registry is the single source of truth for a table's geometry
// (CANONICAL_OWNERSHIP §3 #32). These atoms hold only a bounded read-through
// cache of the last `listTables` projection plus the create-table command,
// its capability witness, and a user-readable diagnostic. No per-cell /
// per-table atom family; table geometry is never stored twice.
// ===========================================================================

export {
  TABLE_CAPABILITY_ERROR,
  TABLE_COLUMN_NAME_UNCHANGED_ERROR,
  TABLE_DELETE_CAPABILITY_ERROR,
  TABLE_DELETE_REJECTION_MESSAGES,
  TABLE_INVALID_NAME_ERROR,
  TABLE_INVALID_SELECTION_ERROR,
  TABLE_MISSING_TARGET_ERROR,
  TABLE_NAME_LIKE_CELL_REF_ERROR,
  TABLE_NAME_UNCHANGED_ERROR,
  TABLE_NO_TABLE_AT_SELECTION_ERROR,
  TABLE_REJECTION_MESSAGES,
  TABLE_RENAME_CAPABILITY_ERROR,
  TABLE_RENAME_COLUMN_CAPABILITY_ERROR,
  TABLE_RENAME_REJECTION_MESSAGES,
  TABLE_TOTALS_CAPABILITY_ERROR,
  tableRejectionMessage,
  type TableDiagnostic,
  type TableDiagnosticCode,
} from './table-messages'
export * from './table-name-rules'
export { findTableForCell, isValidCreateTableRange } from './table-geometry'
export {
  allTablesAtom,
  MAX_TABLE_CATALOG_ENTRIES,
  refreshTableCatalogAtom,
  tablesForSheetAtom,
} from './table-catalog'
export {
  captureTableCapabilityAtom,
  createTableSupportedAtom,
  deleteTableSupportedAtom,
  renameTableColumnSupportedAtom,
  renameTableSupportedAtom,
  toggleTableTotalsSupportedAtom,
} from './table-capabilities'
export {
  clearTableDiagnosticAtom,
  lastCreatedTableNameAtom,
  lastDeletedTableNameAtom,
  lastRenamedTableAtom,
  lastToggledTableTotalsAtom,
  tableDiagnosticAtom,
} from './table-feedback'
export * from './create-table-command'
export * from './toggle-totals-commands'
export * from './total-function-command'
export * from './rename-table-commands'
export * from './delete-table-command'
