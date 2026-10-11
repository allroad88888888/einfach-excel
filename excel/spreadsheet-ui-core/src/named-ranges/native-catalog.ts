import { atom } from '@einfach/core'
import { projectionSnapshotAtom } from '../projection'
import { activeWorkbookSheetAtom, type WorkbookDocumentSheet } from '../runtime/workbook-document'
import type { CellRange } from '../shared'
import type { NativeNamedRange } from './native-types'

const EMPTY: readonly NativeNamedRange[] = Object.freeze([])

/** 已提交目录直接读同一次 Rust 投影，不建本地注册表或第二套撤销。 */
export const nativeNamedRangesAtom = atom((get): readonly NativeNamedRange[] => {
  if (!get(activeWorkbookSheetAtom)) return EMPTY
  const result = get(projectionSnapshotAtom).result
  return result?.kind === 'visible-window' ? result.namedRanges ?? EMPTY : EMPTY
})

/** undefined 表示未定义；null 表示已有名称的目标失效，不能误当成新名称。 */
export function resolveNativeNamedRange(
  name: string,
  names: readonly NativeNamedRange[],
  sheets: readonly WorkbookDocumentSheet[],
): { name: string; sheetId: string; range: CellRange } | null | undefined {
  const entry = names.find((item) => item.name.toUpperCase() === name.trim().toUpperCase())
  if (!entry) return undefined
  const target = entry.target
  const sheet = sheets.find((item) => item.index === target?.sheet)
  if (!target || !sheet) return null
  const [rowStart, colStart, rowEnd, colEnd] = target.range
  if (rowEnd >= sheet.rowCount || colEnd >= sheet.colCount) return null
  return { name: entry.name, sheetId: sheet.id, range: { rowStart, colStart, rowEnd, colEnd } }
}
