import type { CellCoord, CellRange } from '../shared'
import type { SheetProtectionBySheet } from './types'
import { isCellRange, rangesIntersect } from './range-guards'
import { getSheetProtection } from './sheet-state'

export function isCoordUnlocked(
  state: SheetProtectionBySheet,
  sheetId: string,
  coord: CellCoord,
): boolean {
  const protection = getSheetProtection(state, sheetId)
  if (protection.mode === 'open') return true
  return protection.unlockedRanges.some(
    (range) =>
      coord.row >= range.rowStart &&
      coord.row <= range.rowEnd &&
      coord.col >= range.colStart &&
      coord.col <= range.colEnd,
  )
}

function intersectUnlockedRanges(
  unlockedRanges: readonly Readonly<CellRange>[],
  target: Readonly<CellRange>,
): readonly Readonly<CellRange>[] {
  const intersections: Readonly<CellRange>[] = []
  for (const candidate of unlockedRanges) {
    if (!isCellRange(candidate) || !rangesIntersect(candidate, target)) continue
    intersections.push({
      rowStart: Math.max(candidate.rowStart, target.rowStart),
      rowEnd: Math.min(candidate.rowEnd, target.rowEnd),
      colStart: Math.max(candidate.colStart, target.colStart),
      colEnd: Math.min(candidate.colEnd, target.colEnd),
    })
  }
  return intersections
}

function rowBandColumnsAreCovered(
  intersections: readonly Readonly<CellRange>[],
  target: Readonly<CellRange>,
  rowStart: number,
  rowEnd: number,
): boolean {
  const intervals = intersections
    .filter((candidate) => candidate.rowStart <= rowStart && candidate.rowEnd >= rowEnd)
    .map((candidate) => [candidate.colStart, candidate.colEnd] as const)
    .sort((first, second) => first[0] - second[0] || first[1] - second[1])

  let coveredThrough = target.colStart - 1
  for (const [colStart, colEnd] of intervals) {
    if (colStart > coveredThrough + 1) return false
    coveredThrough = Math.max(coveredThrough, colEnd)
    if (coveredThrough >= target.colEnd) return true
  }
  return false
}

/** True when every cell in range is covered by the union of unlockedRanges. */
export function isRangeFullyUnlocked(
  state: SheetProtectionBySheet,
  sheetId: string,
  range: Readonly<CellRange>,
): boolean {
  if (!isCellRange(range)) return false
  const protection = getSheetProtection(state, sheetId)
  if (protection.mode === 'open') return true
  if (protection.unlockedRanges.length === 0) return false

  const intersections = intersectUnlockedRanges(protection.unlockedRanges, range)
  if (intersections.length === 0) return false

  const rowBandStarts = new Set<number>([range.rowStart])
  for (const intersection of intersections) {
    rowBandStarts.add(intersection.rowStart)
    if (intersection.rowEnd < range.rowEnd) {
      rowBandStarts.add(intersection.rowEnd + 1)
    }
  }
  const sortedBandStarts = [...rowBandStarts].sort((first, second) => first - second)
  for (let index = 0; index < sortedBandStarts.length; index++) {
    const rowStart = sortedBandStarts[index]
    const nextBandStart = sortedBandStarts[index + 1]
    const rowEnd = nextBandStart === undefined ? range.rowEnd : nextBandStart - 1
    if (!rowBandColumnsAreCovered(intersections, range, rowStart, rowEnd)) return false
  }
  return true
}

/** True when a protected range contains both locked and unlocked cells. */
export function isRangePartiallyUnlocked(
  state: SheetProtectionBySheet,
  sheetId: string,
  range: Readonly<CellRange>,
): boolean {
  if (!isCellRange(range)) return false
  const protection = getSheetProtection(state, sheetId)
  if (protection.mode === 'open') return false
  const intersectsUnlockedRange = protection.unlockedRanges.some(
    (candidate) => isCellRange(candidate) && rangesIntersect(candidate, range),
  )
  return intersectsUnlockedRange && !isRangeFullyUnlocked(state, sheetId, range)
}
