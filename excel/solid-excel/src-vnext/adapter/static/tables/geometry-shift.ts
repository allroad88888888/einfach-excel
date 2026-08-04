// 一句话：结构性编辑后 Table 几何的跟随。

import type { CellRange } from '@einfach/spreadsheet-ui-core'
import type { StaticBackendState } from '../state'
import { nextAutoColumnName } from './name'

/** Shrink `[lo, hi]` by the deletion of `[d0, d1]`; `null` when fully deleted. */
function shrinkTableInterval(
  lo: number,
  hi: number,
  d0: number,
  d1: number,
): [number, number] | null {
  if (d0 <= lo && hi <= d1) return null
  const count = d1 - d0 + 1
  const newLo = lo < d0 ? lo : lo > d1 ? lo - count : d0
  const ovLo = Math.max(d0, lo)
  const ovHi = Math.min(d1, hi)
  const deleted = ovHi >= ovLo ? ovHi - ovLo + 1 : 0
  const len = hi - lo + 1 - deleted
  return [newLo, newLo + len - 1]
}

type TableRemap = 'keep' | 'delete' | { readonly range: CellRange; readonly columns: string[] }

/**
 * Follow one Table through a structural edit — the TS mirror of the engine
 * `remap_table_geometry` §4.3 follow matrix. `direction` is `1` (insert) /
 * `-1` (delete); `at` is the first affected row/column index.
 */
function remapTableGeometry(
  range: CellRange,
  columns: readonly string[],
  axis: 'row' | 'column',
  at: number,
  count: number,
  direction: 1 | -1,
): TableRemap {
  const { rowStart: sR, rowEnd: eR, colStart: sC, colEnd: eC } = range

  if (axis === 'row') {
    if (direction === 1) {
      const nsR = sR >= at ? sR + count : sR
      const neR = eR >= at ? eR + count : eR
      if (nsR === sR && neR === eR) return 'keep'
      return {
        range: { rowStart: nsR, rowEnd: neR, colStart: sC, colEnd: eC },
        columns: [...columns],
      }
    }
    const d0 = at
    const d1 = at + count - 1
    if (d0 <= sR && sR <= d1) return 'delete' // header row swallowed → drop the Table
    const shrunk = shrinkTableInterval(sR, eR, d0, d1)
    if (!shrunk) return 'delete'
    const [nsR, neR] = shrunk
    if (nsR === sR && neR === eR) return 'keep'
    return {
      range: { rowStart: nsR, rowEnd: neR, colStart: sC, colEnd: eC },
      columns: [...columns],
    }
  }

  if (direction === 1) {
    const nsC = sC >= at ? sC + count : sC
    const neC = eC >= at ? eC + count : eC
    const cols = [...columns]
    // Widening (insert strictly inside the column span): splice auto-named columns.
    if (sC < at && at <= eC) {
      const idx = at - sC
      const used = new Set(cols.map((c) => c.toUpperCase()))
      for (let offset = 0; offset < count; offset += 1) {
        const name = nextAutoColumnName(used)
        used.add(name.toUpperCase())
        cols.splice(idx + offset, 0, name)
      }
    }
    if (nsC === sC && neC === eC && cols.length === columns.length) return 'keep'
    return { range: { rowStart: sR, rowEnd: eR, colStart: nsC, colEnd: neC }, columns: cols }
  }

  const d0 = at
  const d1 = at + count - 1
  const shrunk = shrinkTableInterval(sC, eC, d0, d1)
  if (!shrunk) return 'delete' // every column deleted
  const [nsC, neC] = shrunk
  const cols = [...columns]
  const ovLo = Math.max(d0, sC)
  const ovHi = Math.min(d1, eC)
  if (ovHi >= ovLo) {
    cols.splice(ovLo - sC, ovHi - ovLo + 1)
  }
  if (nsC === sC && neC === eC && cols.length === columns.length) return 'keep'
  return { range: { rowStart: sR, rowEnd: eR, colStart: nsC, colEnd: neC }, columns: cols }
}

/**
 * Follow every Table anchored to `sheetId` through a structural edit. Runs
 * inside the existing structural-op handlers, after the cell/format/dimension
 * shifts. NOT recorded in the undo delta — the same known gap as the worker
 * (design §11/§12): undoing a structural op restores cells but not the Table
 * geometry drift.
 */
export function applyTableShift(
  state: StaticBackendState,
  sheetId: string,
  axis: 'row' | 'column',
  at: number,
  count: number,
  direction: 1 | -1,
): void {
  if (state.tablesByKey.size === 0) return
  for (const [key, entry] of [...state.tablesByKey]) {
    if (entry.sheetId !== sheetId) continue
    const outcome = remapTableGeometry(entry.range, entry.columns, axis, at, count, direction)
    if (outcome === 'keep') continue
    if (outcome === 'delete') {
      state.tablesByKey.delete(key)
      continue
    }
    entry.range = outcome.range
    entry.columns = outcome.columns
  }
}
