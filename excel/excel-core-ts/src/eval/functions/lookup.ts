/** Public registry façade for the lookup-function family. */
import type { FunctionImpl } from '../../types'
import { INDEX, MATCH } from './lookup-index-match'
import { ADDRESS, CHOOSE, COLUMN, COLUMNS, ROW, ROWS } from './lookup-reference-shape'
import { HLOOKUP, VLOOKUP } from './lookup-table'
import { LOOKUP, XMATCH } from './lookup-vector'
import { XLOOKUP } from './lookup-xlookup'

export { INDEX, MATCH } from './lookup-index-match'
export { ADDRESS, CHOOSE, COLUMN, COLUMNS, ROW, ROWS } from './lookup-reference-shape'
export { HLOOKUP, VLOOKUP } from './lookup-table'
export { LOOKUP, XMATCH } from './lookup-vector'
export { XLOOKUP, resolveXLookupValue } from './lookup-xlookup'
export type { XLookupCoreResult } from './lookup-xlookup'

export const FUNCTIONS: Record<string, FunctionImpl> = {
  VLOOKUP,
  HLOOKUP,
  INDEX,
  MATCH,
  XLOOKUP,
  LOOKUP,
  XMATCH,
  CHOOSE,
  ROWS,
  COLUMNS,
  ROW,
  COLUMN,
  ADDRESS,
}
