/** LOOKUP and XMATCH vector lookup implementations. */
import type { FunctionImpl, Value } from '../../types'
import {
  compareOrdered,
  exactLookupMatch,
  hasWildcardPattern,
  numericRank,
} from './lookup-comparison'
import { ERR_NA, ERR_VALUE, asLookupGrid, gridToLookupVector, lookupNumber } from './lookup-common'

export const LOOKUP: FunctionImpl = (args, _ctx) => {
  if (args.length < 2 || args.length > 3) return ERR_VALUE
  for (const argument of args) if (argument?.kind === 'error') return argument
  const lookupGrid = asLookupGrid(args[1])
  if (!lookupGrid) return ERR_VALUE
  if (args.length === 2) return lookupArrayForm(args[0], lookupGrid)
  const lookupValues = gridToLookupVector(lookupGrid)
  const resultGrid = asLookupGrid(args[2])
  const resultValues = resultGrid && gridToLookupVector(resultGrid)
  return !lookupValues || !resultValues
    ? ERR_VALUE
    : lookupVectorWalk(lookupValues, resultValues, args[0])
}

export const XMATCH: FunctionImpl = (args, _ctx) => {
  if (args.length < 2 || args.length > 4) return ERR_VALUE
  if (args[0].kind === 'error' || args[1].kind === 'error')
    return args.find((argument) => argument.kind === 'error')!
  const matchMode = lookupNumber(args[2], 0)
  const searchMode = lookupNumber(args[3], 1)
  if (
    matchMode === null ||
    searchMode === null ||
    ![-1, 0, 1, 2].includes(matchMode) ||
    ![-2, -1, 1, 2].includes(searchMode)
  )
    return ERR_VALUE
  if (matchMode === 2 && Math.abs(searchMode) === 2) return ERR_VALUE
  const grid = asLookupGrid(args[1])
  if (!grid) return ERR_VALUE
  const values = grid.flat()
  for (const value of values) if (value.kind === 'error') return value
  const indices =
    searchMode === -1
      ? values.map((_, index) => values.length - index - 1)
      : values.map((_, index) => index)
  const wildcard = matchMode === 2 || (matchMode === 0 && hasWildcardPattern(args[0]))
  let best = -1
  let bestDifference = Infinity
  const needleRank = numericRank(args[0])
  for (const index of indices) {
    const value = values[index]
    if (exactLookupMatch(args[0], value, wildcard)) return { kind: 'number', value: index + 1 }
    if (matchMode !== -1 && matchMode !== 1) continue
    const rank = numericRank(value)
    if (needleRank === null || rank === null) continue
    const difference = matchMode === -1 ? needleRank - rank : rank - needleRank
    if (difference >= 0 && difference < bestDifference) {
      best = index
      bestDifference = difference
    }
  }
  return best === -1 ? ERR_NA : { kind: 'number', value: best + 1 }
}

function lookupArrayForm(needle: Value, grid: Value[][]): Value {
  const rows = grid.length
  const columns = grid[0].length
  if (rows === 1 || columns === 1) {
    const values = gridToLookupVector(grid)
    return values ? lookupVectorWalk(values, values, needle) : ERR_VALUE
  }
  return columns >= rows
    ? lookupVectorWalk(grid[0], grid[rows - 1], needle)
    : lookupVectorWalk(
        grid.map((row) => row[0]),
        grid.map((row) => row[columns - 1]),
        needle,
      )
}

function lookupVectorWalk(
  keys: ReadonlyArray<Value>,
  results: ReadonlyArray<Value>,
  needle: Value,
): Value {
  if (keys.length === 0 || keys.length !== results.length) return ERR_VALUE
  let best = -1
  for (let index = 0; index < keys.length; index += 1) {
    if (keys[index].kind === 'error') return keys[index]
    const comparison = compareOrdered(keys[index], needle)
    if (comparison !== null && comparison <= 0) best = index
  }
  return best === -1 ? ERR_NA : results[best]
}
