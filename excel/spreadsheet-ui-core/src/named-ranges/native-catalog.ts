import { atom } from '@einfach/core'
import { projectionSnapshotAtom } from '../projection/state'
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

function splitSheetQualifiedInput(raw: string): { sheetName?: string; name: string } {
  const trimmed = raw.trim()
  const bang = trimmed.lastIndexOf('!')
  if (bang <= 0) return { name: trimmed }
  let sheetName = trimmed.slice(0, bang).trim()
  if (sheetName.startsWith("'") && sheetName.endsWith("'") && sheetName.length >= 2) {
    sheetName = sheetName.slice(1, -1).replace(/''/g, "'")
  }
  return { sheetName, name: trimmed.slice(bang + 1).trim() }
}

/** undefined 表示未定义或为纯公式名称；null 表示已有范围名称的目标失效，不能误当成新名称。 */
export function resolveNativeNamedRange(
  name: string,
  names: readonly NativeNamedRange[],
  sheets: readonly WorkbookDocumentSheet[],
  activeSheetId?: string,
): { name: string; sheetId: string; range: CellRange } | null | undefined {
  const parsed = splitSheetQualifiedInput(name)
  const upper = parsed.name.toUpperCase()
  let entry: NativeNamedRange | undefined
  if (parsed.sheetName !== undefined) {
    const scopeSheet = sheets.find((s) => s.name.toUpperCase() === parsed.sheetName!.toUpperCase())
    if (!scopeSheet) return undefined
    entry =
      names.find((item) => item.name.toUpperCase() === upper && item.scope === scopeSheet.index) ??
      names.find((item) => item.name.toUpperCase() === upper && item.scope == null)
  } else {
    const activeSheet = activeSheetId ? sheets.find((s) => s.id === activeSheetId) : undefined
    entry =
      (activeSheet
        ? names.find(
            (item) => item.name.toUpperCase() === upper && item.scope === activeSheet.index,
          )
        : undefined) ??
      names.find((item) => item.name.toUpperCase() === upper && item.scope == null) ??
      (activeSheet ? undefined : names.find((item) => item.name.toUpperCase() === upper))
  }
  if (!entry || entry.formula != null) return undefined
  const target = entry.target
  const sheet = sheets.find((item) => item.index === target?.sheet)
  if (!target || !sheet) return null
  const [rowStart, colStart, rowEnd, colEnd] = target.range
  if (rowEnd >= sheet.rowCount || colEnd >= sheet.colCount) return null
  return { name: entry.name, sheetId: sheet.id, range: { rowStart, colStart, rowEnd, colEnd } }
}
