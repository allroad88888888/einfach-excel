/**
 * 环检测键。
 *
 * 职责：给「某个 `cells` 快照里的某个 `CellKey`」造一个跨表不会撞车的键。
 */
import type { Cell, CellKey } from '../types'

/**
 * Tag a cells-Map identity so the cycle set can distinguish
 * `Sheet1!A1` from `Sheet2!A1`. The tag is stable across calls within
 * a single derive (since the same `cells` Map reference flows through),
 * and lives in a WeakMap so unused tags get GC'd with the Map.
 */
const cellsMapTags = new WeakMap<object, string>()
let cellsMapTagCounter = 0
export function tagFor(cells: ReadonlyMap<CellKey, Cell>): string {
  const existing = cellsMapTags.get(cells)
  if (existing !== undefined) return existing
  cellsMapTagCounter += 1
  const tag = `m${cellsMapTagCounter}`
  cellsMapTags.set(cells, tag)
  return tag
}

/**
 * Build the composite cycle-set key for `(cells, cellKey)`. Exported so
 * `sheet.ts` can seed the set with the entry-point cell before invoking
 * `evaluate` directly (the entry doesn't flow through `resolveCell` and
 * would otherwise re-enter unguarded).
 */
export function cycleGuardKey(
  cells: ReadonlyMap<CellKey, Cell>,
  key: CellKey,
): CellKey {
  return `${tagFor(cells)}:${key}`
}
