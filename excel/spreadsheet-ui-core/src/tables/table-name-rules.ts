import { parseA1Cell } from '../name-box/address'

/** Table names share the engine's defined-name shape (`workbook.rs::validate_name`). */
export const TABLE_NAME_MAX_LENGTH = 255

const TABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Local mirror of the engine's table-name shape gate (`[A-Za-z_][A-Za-z0-9_]*`,
 * 1..=255). Used to reject a typo before it costs a worker round-trip; the
 * engine stays canonical and re-asserts the same rule.
 */
export function isValidTableName(name: string): boolean {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  return (
    trimmed.length > 0 &&
    trimmed.length <= TABLE_NAME_MAX_LENGTH &&
    TABLE_NAME_PATTERN.test(trimmed)
  )
}

/**
 * Local mirror of the engine's `name_is_cell_ref_like` gate: a name that
 * parses as an in-grid A1 address (`Q1`, `AB12`) would shadow a cell
 * reference and is rejected. `Table1` is NOT cell-ref-like — its column
 * label overflows the grid, exactly as in the engine.
 */
export function isCellRefLikeTableName(name: string): boolean {
  return parseA1Cell(typeof name === 'string' ? name : '') !== null
}
