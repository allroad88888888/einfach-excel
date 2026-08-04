/** VLOOKUP and HLOOKUP table lookup implementations. */
import type { FunctionImpl, Value } from '../../types'
import { propagateError } from '../coerce'
import { BSEARCH_UNSORTABLE, binaryApproxAscending } from './lookup-binary-search'
import { compareOrdered, exactLookupMatch } from './lookup-comparison'
import {
  ERR_NA,
  ERR_REF,
  ERR_VALUE,
  asLookupGrid,
  lookupBoolean,
  lookupNumber,
} from './lookup-common'

export const VLOOKUP: FunctionImpl = (args, _ctx) => {
  if (args.length < 3 || args.length > 4) return ERR_VALUE
  const error = propagateError(args)
  if (error) return error
  const table = asLookupGrid(args[1])
  const column = lookupNumber(args[2], NaN)
  if (!table || column === null || !Number.isFinite(column) || column < 1) return ERR_VALUE
  if (column > table[0].length) return ERR_REF
  const approximate = args.length === 4 ? lookupBoolean(args[3], true) : true
  if (approximate === null) return ERR_VALUE
  const row = findTableIndex(
    args[0],
    table.map((cells) => cells[0]),
    approximate,
  )
  return row === -1 ? ERR_NA : (table[row][column - 1] ?? { kind: 'blank' })
}

export const HLOOKUP: FunctionImpl = (args, _ctx) => {
  if (args.length < 3 || args.length > 4) return ERR_VALUE
  const error = propagateError(args)
  if (error) return error
  const table = asLookupGrid(args[1])
  const row = lookupNumber(args[2], NaN)
  if (!table || row === null || !Number.isFinite(row) || row < 1) return ERR_VALUE
  if (row > table.length) return ERR_REF
  const approximate = args.length === 4 ? lookupBoolean(args[3], true) : true
  if (approximate === null) return ERR_VALUE
  const column = findTableIndex(args[0], table[0], approximate)
  return column === -1 ? ERR_NA : (table[row - 1][column] ?? { kind: 'blank' })
}

function findTableIndex(needle: Value, values: ReadonlyArray<Value>, approximate: boolean): number {
  if (!approximate) return values.findIndex((value) => exactLookupMatch(needle, value, true))
  const binary = binaryApproxAscending(values, needle)
  if (binary !== BSEARCH_UNSORTABLE) return binary
  let best = -1
  for (let index = 0; index < values.length; index += 1) {
    const comparison = compareOrdered(values[index], needle)
    if (comparison === null) continue
    if (comparison <= 0) best = index
    else break
  }
  return best
}
