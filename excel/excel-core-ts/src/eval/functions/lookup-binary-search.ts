/** Sorted lookup search with blank compaction and an unsortable sentinel. */
import type { Value } from '../../types'
import { compareForLookup } from './lookup-comparison'

export const BSEARCH_UNSORTABLE = -2

export function binaryApproxAscending(values: ReadonlyArray<Value>, needle: Value): number {
  return binaryLookupSearch(values, needle, 'lte', 'asc')
}

export function binaryLookupSearch(
  source: ReadonlyArray<Value>,
  target: Value,
  mode: 'exact' | 'lte' | 'gte',
  direction: 'asc' | 'desc',
): number {
  const packed = packNonBlank(source)
  if (packed.values.length === 0) return -1
  let low = 0
  let high = packed.values.length - 1
  let best = -1
  while (low <= high) {
    const middle = (low + high) >>> 1
    const comparison = compareForLookup(packed.values[middle], target)
    if (comparison === null) return BSEARCH_UNSORTABLE
    if (comparison === 0) {
      if (mode === 'exact') return originalIndex(packed.indices, middle)
      best = middle
      const continueRight =
        (direction === 'asc' && mode === 'lte') || (direction === 'desc' && mode === 'gte')
      if (continueRight) low = middle + 1
      else high = middle - 1
    } else if (comparison < 0) {
      if (mode === 'lte') best = middle
      if (direction === 'asc') low = middle + 1
      else high = middle - 1
    } else {
      if (mode === 'gte') best = middle
      if (direction === 'asc') high = middle - 1
      else low = middle + 1
    }
  }
  return best === -1 ? -1 : originalIndex(packed.indices, best)
}

function packNonBlank(source: ReadonlyArray<Value>): {
  readonly values: ReadonlyArray<Value>
  readonly indices?: ReadonlyArray<number>
} {
  if (!source.some((value) => value.kind === 'blank')) return { values: source }
  const values: Value[] = []
  const indices: number[] = []
  for (let index = 0; index < source.length; index += 1) {
    if (source[index].kind !== 'blank') {
      values.push(source[index])
      indices.push(index)
    }
  }
  return { values, indices }
}

function originalIndex(indices: ReadonlyArray<number> | undefined, index: number): number {
  return indices ? indices[index] : index
}
