import { atom } from '@einfach/core'
import type { SpreadsheetCellFormat } from '../contracts'
import type {
  FindAlign,
  FindNumberFormatKind,
  RustFindFormatFilter,
  RustFindMatch,
  RustFindQuery,
} from '../rust-workbook/find-commands'
import type { CellRange } from '../shared'

export interface FindReplaceForm extends RustFindQuery {
  readonly replacement: string
  readonly replaceFormat?: RustFindFormatFilter
  readonly scope: 'sheet' | 'workbook' | 'current-selection'
}

export interface FindReplacePanel {
  readonly open: boolean
  readonly tab: 'find' | 'replace'
  readonly form: FindReplaceForm
  /** 打开时捕获作用域，结果导航不能把原选区或原工作表改成下一次搜索范围。 */
  readonly origin: {
    readonly sheetId: string
    readonly range: CellRange
    readonly regions: number
  } | null
  readonly busy: 'find' | 'replace' | null
  readonly result: {
    readonly index: number
    readonly total: number
    readonly revision: number
    readonly current: RustFindMatch | null
    /** 有界结果页；total 仍为完整查询总数，不在 UI 镜像整份工作簿。 */
    readonly page?: { readonly offset: number; readonly matches: readonly RustFindMatch[] }
  } | null
  readonly error: string | null
  readonly notice: string | null
}

export function cleanFindFormat(
  format: RustFindFormatFilter | undefined,
): RustFindFormatFilter | undefined {
  if (!format) return undefined
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(format)) {
    if (value !== undefined && value !== '') next[key] = value
  }
  return Object.keys(next).length > 0 ? (next as RustFindFormatFilter) : undefined
}

export function hasFindFormatCriteria(format: RustFindFormatFilter | undefined): boolean {
  return cleanFindFormat(format) !== undefined
}

function mapNumberFormatKind(
  format: SpreadsheetCellFormat['numberFormat'],
): FindNumberFormatKind | undefined {
  if (!format) return undefined
  switch (format.kind) {
    case 'decimal':
      return 'number'
    case 'percentage':
      return 'percent'
    case 'general':
    case 'text':
    case 'number':
    case 'percent':
    case 'currency':
    case 'accounting':
    case 'date':
    case 'time':
    case 'scientific':
    case 'fraction':
    case 'special':
    case 'custom':
      return format.kind
    default:
      return undefined
  }
}

function mapAlign(align: SpreadsheetCellFormat['align']): FindAlign | undefined {
  if (!align || align === 'default') return undefined
  if (align === 'centerAcross') return 'center-across'
  if (align === 'left' || align === 'center' || align === 'right') return align
  return undefined
}

/** Captures explicit visual style attributes from the active cell for "Choose format from cell". */
export function extractFormatFromCell(
  format: SpreadsheetCellFormat | undefined,
): RustFindFormatFilter | undefined {
  if (!format) return undefined
  const numKind = mapNumberFormatKind(format.numberFormat)
  return cleanFindFormat({
    ...(format.bold ? { bold: true } : {}),
    ...(format.italic ? { italic: true } : {}),
    ...(format.underline ? { underline: true } : {}),
    ...(format.strikethrough ? { strikethrough: true } : {}),
    ...(format.fgColor ? { textColor: format.fgColor.toLowerCase() } : {}),
    ...(format.bgColor && !format.fill ? { bgColor: format.bgColor.toLowerCase() } : {}),
    ...(format.fontSize ? { fontSize: format.fontSize } : {}),
    ...(format.fontFamily ? { fontFamily: format.fontFamily } : {}),
    ...(mapAlign(format.align) ? { align: mapAlign(format.align) } : {}),
    ...(format.wrap ? { wrapText: true } : {}),
    ...(numKind && numKind !== 'general' ? { numberFormat: numKind } : {}),
  })
}

export const findReplaceStateAtom = atom<FindReplacePanel>({
  open: false,
  tab: 'find',
  origin: null,
  busy: null,
  result: null,
  error: null,
  notice: null,
  form: {
    needle: '',
    replacement: '',
    caseSensitive: false,
    wholeCell: false,
    wildcards: false,
    lookIn: 'formulas',
    scope: 'sheet',
  },
})

/** 视图只读面板投影；写入全部经过同一个语义 command。 */
export const findReplacePanelAtom = atom((get) => get(findReplaceStateAtom))
findReplacePanelAtom.debugLabel = 'spreadsheet.findReplace.panel'
