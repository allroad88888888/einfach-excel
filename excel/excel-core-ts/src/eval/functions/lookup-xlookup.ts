/** XLOOKUP matching and return-shape projection. */
import type { FunctionImpl, Value } from '../../types'
import { BSEARCH_UNSORTABLE, binaryLookupSearch } from './lookup-binary-search'
import { compareForLookup, exactLookupMatch, numericRank } from './lookup-comparison'
import { ERR_NA, ERR_VALUE, asLookupGrid, lookupNumber } from './lookup-common'

export type XLookupCoreResult =
  | { readonly kind: 'value'; readonly value: Value }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'error'; readonly error: Value }

export const XLOOKUP: FunctionImpl = (args, _ctx) => {
  if (args.length < 3 || args.length > 6) return ERR_VALUE
  const fallback = args[3] !== undefined && args[3].kind !== 'blank' ? args[3] : null
  const result = resolveXLookupValue(args[0], args[1], args[2], args[4], args[5])
  if (result.kind === 'value') return result.value
  if (result.kind === 'error') return result.error
  return fallback ?? ERR_NA
}

export function resolveXLookupValue(
  needle: Value,
  lookupValue: Value,
  returnValue: Value,
  matchModeArgument?: Value,
  searchModeArgument?: Value,
): XLookupCoreResult {
  for (const value of [needle, lookupValue, returnValue, matchModeArgument, searchModeArgument]) {
    if (value?.kind === 'error') return { kind: 'error', error: value }
  }
  const lookupGrid = asLookupGrid(lookupValue)
  const returnGrid = asLookupGrid(returnValue)
  if (!lookupGrid || !returnGrid) return { kind: 'error', error: ERR_VALUE }
  const matchMode = lookupNumber(matchModeArgument, 0)
  const searchMode = lookupNumber(searchModeArgument, 1)
  if (
    matchMode === null ||
    searchMode === null ||
    ![-1, 0, 1, 2].includes(matchMode) ||
    ![-2, -1, 1, 2].includes(searchMode)
  ) {
    return { kind: 'error', error: ERR_VALUE }
  }
  if (matchMode === 2 && Math.abs(searchMode) === 2) return { kind: 'error', error: ERR_VALUE }
  const lookupValues = lookupGrid.flat()
  const isColumnLookup = lookupGrid.length >= lookupGrid[0].length
  if (
    isColumnLookup
      ? returnGrid.length !== lookupValues.length
      : returnGrid[0].length !== lookupValues.length
  ) {
    return { kind: 'error', error: ERR_VALUE }
  }
  const index = findXLookupIndex(needle, lookupValues, matchMode, searchMode)
  if (index === -1) return { kind: 'notFound' }
  return { kind: 'value', value: projectXLookupReturn(returnGrid, index, isColumnLookup) }
}

function projectXLookupReturn(grid: Value[][], index: number, isColumnLookup: boolean): Value {
  if (isColumnLookup) {
    const row = grid[index]
    return row.length === 1 ? row[0] : { kind: 'array', value: [row.slice()] }
  }
  if (grid.length === 1) return grid[0][index]
  return { kind: 'array', value: grid.map((row) => [row[index]]) }
}

function findXLookupIndex(
  needle: Value,
  values: Value[],
  matchMode: number,
  searchMode: number,
): number {
  if (searchMode === 2 || searchMode === -2) {
    const mode =
      matchMode === -1 ? 'lte' : matchMode === 1 ? 'gte' : matchMode === 0 ? 'exact' : undefined
    if (mode) {
      const binary = binaryLookupSearch(values, needle, mode, searchMode === 2 ? 'asc' : 'desc')
      if (binary !== BSEARCH_UNSORTABLE) return binary
    }
  }
  return scanXLookup(
    needle,
    values,
    matchMode,
    searchMode === -1 ? values.length - 1 : 0,
    searchMode === -1 ? -1 : values.length,
    searchMode === -1 ? -1 : 1,
  )
}

function scanXLookup(
  needle: Value,
  values: ReadonlyArray<Value>,
  matchMode: number,
  from: number,
  end: number,
  step: number,
): number {
  let smaller = -1
  let smallerDistance = -Infinity
  let larger = -1
  let largerDistance = Infinity
  for (let index = from; step > 0 ? index < end : index > end; index += step) {
    const value = values[index]
    if (exactLookupMatch(needle, value, matchMode === 2)) return index
    if (matchMode !== -1 && matchMode !== 1) continue
    const comparison = compareForLookup(value, needle)
    if (comparison === null) continue
    const distance = rankedDistance(value, needle)
    if (matchMode === -1 && comparison < 0 && distance !== null && distance > smallerDistance) {
      smaller = index
      smallerDistance = distance
    } else if (
      matchMode === 1 &&
      comparison > 0 &&
      distance !== null &&
      distance < largerDistance
    ) {
      larger = index
      largerDistance = distance
    }
  }
  return matchMode === -1 ? smaller : matchMode === 1 ? larger : -1
}

function rankedDistance(value: Value, needle: Value): number | null {
  const valueRank = numericRank(value)
  const needleRank = numericRank(needle)
  return valueRank === null || needleRank === null ? null : valueRank - needleRank
}
