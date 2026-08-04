/** INDEX and MATCH array lookup implementations. */
import type { FunctionImpl, Value } from '../../types'
import { propagateError } from '../coerce'
import { BSEARCH_UNSORTABLE, binaryLookupSearch } from './lookup-binary-search'
import { compareOrdered, exactLookupMatch } from './lookup-comparison'
import { ERR_NA, ERR_REF, ERR_VALUE, asLookupGrid, lookupNumber } from './lookup-common'

export const INDEX: FunctionImpl = (args, _ctx) => {
  if (args.length < 2 || args.length > 3) return ERR_VALUE
  if (args[0].kind === 'error') return args[0]
  for (const argument of args.slice(1)) if (argument.kind === 'error') return argument
  const grid = asLookupGrid(args[0])
  if (!grid) return ERR_VALUE
  const rows = grid.length
  const columns = grid[0].length
  const row = lookupNumber(args[1], 0)
  const columnIsExplicit = args[2] !== undefined
  const column = lookupNumber(args[2], 0)
  if (row === null || column === null) return ERR_VALUE
  if (!columnIsExplicit) {
    const implicit = selectImplicitIndex(grid, row)
    if (implicit !== undefined) return implicit
  }
  if (row < 0 || column < 0) return ERR_VALUE
  if (row > rows || column > columns) return ERR_REF
  if (row === 0 && column === 0) return { kind: 'array', value: grid.map((cells) => cells.slice()) }
  if (row === 0) return { kind: 'array', value: grid.map((cells) => [cells[column - 1]]) }
  if (column === 0) return { kind: 'array', value: [grid[row - 1].slice()] }
  return grid[row - 1][column - 1]
}

export const MATCH: FunctionImpl = (args, _ctx) => {
  if (args.length < 2 || args.length > 3) return ERR_VALUE
  const error = propagateError(args)
  if (error) return error
  const grid = asLookupGrid(args[1])
  const matchType = lookupNumber(args[2], 1)
  if (!grid || matchType === null || ![-1, 0, 1].includes(matchType)) return ERR_VALUE
  const values = grid.flat()
  if (matchType === 0) {
    const index = values.findIndex((value) => exactLookupMatch(args[0], value, true))
    return index === -1 ? ERR_NA : { kind: 'number', value: index + 1 }
  }
  const mode = matchType === 1 ? 'lte' : 'gte'
  const direction = matchType === 1 ? 'asc' : 'desc'
  const binary = binaryLookupSearch(values, args[0], mode, direction)
  if (binary !== BSEARCH_UNSORTABLE)
    return binary === -1 ? ERR_NA : { kind: 'number', value: binary + 1 }
  const index = findApproximateIndex(values, args[0], matchType)
  return index === -1 ? ERR_NA : { kind: 'number', value: index + 1 }
}

function selectImplicitIndex(grid: Value[][], row: number): Value | undefined {
  const rows = grid.length
  const columns = grid[0].length
  if (rows === 1 && columns > 1) return row < 1 || row > columns ? ERR_REF : grid[0][row - 1]
  if (columns === 1 && rows > 1) return row < 1 || row > rows ? ERR_REF : grid[row - 1][0]
  if (rows === 1 && columns === 1) return row === 0 || row === 1 ? grid[0][0] : ERR_REF
  return undefined
}

function findApproximateIndex(
  values: ReadonlyArray<Value>,
  needle: Value,
  matchType: number,
): number {
  let best = -1
  for (let index = 0; index < values.length; index += 1) {
    const comparison = compareOrdered(values[index], needle)
    if (comparison === null) continue
    if (matchType === 1 && comparison <= 0) best = index
    else if (matchType === -1 && comparison >= 0) best = index
    else break
  }
  return best
}
