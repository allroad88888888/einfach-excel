/**
 * 把 `readSpillRegion` 应答里**不可信的形状**收敛成可信的值，收敛不了就 `null`。
 *
 * 这里的每一条检查都对应「与其画错，不如什么都不画」：后端是宿主实现的，越过这层
 * 的值会直接变成屏幕上的一个蓝框、一句「被 X 挡住」、或公式栏里一条灰公式。
 */
import type { CellCoord } from '../shared'
import type { SpillRegion } from './types'

export function isFiniteIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

export function normalizeCoord(coord: unknown): CellCoord | null {
  if (typeof coord !== 'object' || coord === null) return null
  const { row, col } = coord as Partial<CellCoord>
  if (!isFiniteIndex(row) || !isFiniteIndex(col)) return null
  return { row, col }
}

export function normalizeRegion(region: unknown): SpillRegion | null {
  if (typeof region !== 'object' || region === null) return null
  const { anchor, range } = region as Partial<SpillRegion>
  if (!anchor || !range) return null
  if (!isFiniteIndex(anchor.row) || !isFiniteIndex(anchor.col)) return null
  if (!isFiniteIndex(range.rowStart) || !isFiniteIndex(range.rowEnd)) return null
  if (!isFiniteIndex(range.colStart) || !isFiniteIndex(range.colEnd)) return null
  if (range.rowEnd < range.rowStart || range.colEnd < range.colStart) return null
  // 锚点恒在矩形左上角 —— 引擎侧的两个实现都是这么算的，破了这条说明 wire 坏了，
  // 与其画一个歪掉的框不如什么都不画。
  if (anchor.row !== range.rowStart || anchor.col !== range.colStart) return null
  return {
    anchor: { row: anchor.row, col: anchor.col },
    range: {
      rowStart: range.rowStart,
      rowEnd: range.rowEnd,
      colStart: range.colStart,
      colEnd: range.colEnd,
    },
  }
}

/**
 * 锚点公式原文。非字符串、空串、不以 `=` 开头的一律当**答不出**。
 *
 * 「不以 `=` 开头」这条不是洁癖：公式栏拿到它是要当**公式**显示的，一个不带 `=` 的
 * 字面量说明后端把值当成了公式，显示出来会让用户以为锚点里放的是常量。
 */
export function normalizeAnchorFormula(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return value.startsWith('=') ? value : undefined
}
