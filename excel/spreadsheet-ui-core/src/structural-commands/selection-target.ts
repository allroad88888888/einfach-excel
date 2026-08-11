import type { SelectionSnapshot } from '../selection/types'

export interface StructuralSelectionTarget {
  readonly sheetId: string
  readonly rowStart: number
  readonly rowEnd: number
  readonly colStart: number
  readonly colEnd: number
}

/**
 * Validate the selection fact once before a structure command derives a
 * backend operation or local visibility delta from it.
 */
export function resolveStructuralSelectionTarget(
  snapshot: SelectionSnapshot,
): StructuralSelectionTarget | null {
  const sheetId = snapshot.selection.sheetId
  const { rowStart, rowEnd, colStart, colEnd } = snapshot.range
  if (
    !sheetId ||
    !isIndexSpan(rowStart, rowEnd) ||
    !isIndexSpan(colStart, colEnd) ||
    rowEnd === Number.MAX_SAFE_INTEGER ||
    colEnd === Number.MAX_SAFE_INTEGER
  ) {
    return null
  }

  return Object.freeze({ sheetId, rowStart, rowEnd, colStart, colEnd })
}

export function selectedAxisIndices(start: number, end: number): readonly number[] {
  const indices: number[] = []
  for (let index = start; index <= end; index += 1) indices.push(index)
  return Object.freeze(indices)
}

export function selectedAxisCount(start: number, end: number): number {
  return end - start + 1
}

function isIndexSpan(start: number, end: number): boolean {
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end >= start
}
