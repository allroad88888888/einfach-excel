import type { TableMutationRejectionCode } from './types'

export const TABLE_INVALID_SELECTION_ERROR =
  'Create table needs a selection with a header row and at least one data row.'

export const TABLE_CAPABILITY_ERROR =
  'Tables are unavailable because this workbook does not provide createTable.'

export const TABLE_TOTALS_CAPABILITY_ERROR =
  'The totals row is unavailable because this workbook does not provide setTableTotalsRow.'

export const TABLE_NO_TABLE_AT_SELECTION_ERROR =
  'The active cell is not inside a table. Select a cell within a table to toggle its totals row.'

export const TABLE_RENAME_CAPABILITY_ERROR =
  'Renaming a table is unavailable because this workbook does not provide renameTable.'

export const TABLE_RENAME_COLUMN_CAPABILITY_ERROR =
  'Renaming a table column is unavailable because this workbook does not provide renameTableColumn.'

export const TABLE_DELETE_CAPABILITY_ERROR =
  'Deleting a table is unavailable because this workbook does not provide deleteTable.'

export const TABLE_INVALID_NAME_ERROR =
  'The table name is invalid. Use letters, digits and underscores, ' +
  'starting with a letter or underscore.'

export const TABLE_NAME_LIKE_CELL_REF_ERROR =
  'The table name looks like a cell reference. Choose another name.'

export const TABLE_NAME_UNCHANGED_ERROR = 'The new name is the same as the current name.'

export const TABLE_COLUMN_NAME_UNCHANGED_ERROR =
  'The new column name is the same as the current name.'

export const TABLE_MISSING_TARGET_ERROR = 'No table was named for this operation.'

/** Structured-reject code → user-readable prompt (design §4/§10). */
export const TABLE_REJECTION_MESSAGES: Readonly<Record<TableMutationRejectionCode, string>> =
  Object.freeze({
    'too-many-tables':
      'Create table failed: this workbook already has the maximum number of tables.',
    'invalid-name': 'Create table failed: the table name is invalid.',
    'reserved-name': 'Create table failed: that name is reserved by a built-in function.',
    'name-like-cell-ref':
      'Create table failed: the name looks like a cell reference. Choose another name.',
    'name-conflict': 'Create table failed: that name is already in use.',
    'range-overlap': 'Create table failed: the selection overlaps an existing table.',
    'sheet-not-found': 'Create table failed: the target sheet could not be found.',
    'not-found': 'Table operation failed: the table could not be found.',
    'column-not-found': 'Table operation failed: the column could not be found.',
    'duplicate-column': 'Table operation failed: that column name is already in use.',
    'invalid-column-name': 'Table operation failed: the column name is invalid.',
    'mutation-during-custom-call':
      'Table operation failed: a custom formula is still running. Try again.',
    'totals-row-blocked':
      'Totals row failed: the row below the table is occupied. Clear it and try again.',
    'no-totals-row': 'Totals function failed: enable the totals row first.',
    'invalid-totals-function': 'Totals function failed: that aggregate is not recognized.',
    'invalid-payload': 'Table operation failed: the request was malformed.',
  })

/**
 * Rename-flavored overrides for the codes a rename can actually produce —
 * the shared {@link TABLE_REJECTION_MESSAGES} copy is create-flavored, and
 * "Create table failed: …" is wrong prose for a rename. Codes absent here
 * fall through to the shared map.
 */
export const TABLE_RENAME_REJECTION_MESSAGES: Readonly<
  Partial<Record<TableMutationRejectionCode, string>>
> = Object.freeze({
  'invalid-name': 'Rename failed: the table name is invalid.',
  'reserved-name': 'Rename failed: that name is reserved by a built-in function.',
  'name-like-cell-ref': 'Rename failed: the name looks like a cell reference. Choose another name.',
  'name-conflict': 'Rename failed: that name is already in use.',
  'not-found': 'Rename failed: the table could not be found.',
  'column-not-found': 'Rename failed: the column could not be found.',
  'duplicate-column': 'Rename failed: that column name is already in use.',
  'invalid-column-name': 'Rename failed: the column name is invalid.',
  'invalid-payload': 'Rename failed: the request was malformed.',
})

/** Delete-flavored overrides (see {@link TABLE_RENAME_REJECTION_MESSAGES}). */
export const TABLE_DELETE_REJECTION_MESSAGES: Readonly<
  Partial<Record<TableMutationRejectionCode, string>>
> = Object.freeze({
  'not-found': 'Delete failed: the table could not be found.',
  'invalid-payload': 'Delete failed: the request was malformed.',
})

export type TableDiagnosticCode =
  | TableMutationRejectionCode
  | 'invalid-selection'
  | 'no-table-at-selection'
  | 'name-unchanged'
  | 'capability'
  | 'outcome-unknown'

export interface TableDiagnostic {
  readonly code: TableDiagnosticCode
  readonly message: string
}

export function tableRejectionMessage(code: TableMutationRejectionCode, fallback?: string): string {
  return TABLE_REJECTION_MESSAGES[code] ?? fallback ?? 'Table operation failed.'
}

export function operationRejectionMessage(
  overrides: Readonly<Partial<Record<TableMutationRejectionCode, string>>>,
  code: TableMutationRejectionCode,
  fallback?: string,
): string {
  return overrides[code] ?? tableRejectionMessage(code, fallback)
}

/** Shared `outcome-unknown` copy for a mutation whose history push failed. */
export const TABLE_HISTORY_SKEW_MESSAGE =
  'The table changed but it could not be recorded in the undo history; undo may be out of step.'
