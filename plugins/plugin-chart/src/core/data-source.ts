import type { DrawingRange, NativeNamedRange, NativeTable } from '@einfach-excel/spreadsheet-ui-core'
import { parseRangeText } from './range-text'

/**
 * 图表数据引用表格或已定义名称（同 Excel 的「选择数据源」可写名称）：
 * `Sales`、`Data!Sales`（工作表级名称）、`Table1`、`Table1[Revenue]`、`Table1[[Month]:[West]]`。
 * 每次读数据时按当前投影解析，表格扩行、名称改指向后图表跟着变。
 */
export type ChartSourceRef =
  | { readonly kind: 'name'; readonly name: string; readonly sheet?: string }
  | { readonly kind: 'table'; readonly table: string; readonly from?: string; readonly to?: string }

const NAME = /^[\p{L}_\\][\p{L}\p{N}_.\\]*$/u

export function parseChartSource(text: string): ChartSourceRef | null {
  const trimmed = text.trim()
  const table = /^([^[\]!']+)\[(.+)\]$/.exec(trimmed)
  if (table) {
    const name = table[1]!.trim()
    if (!NAME.test(name)) return null
    const inner = table[2]!.trim()
    const span = /^\[([^\]]+)\]\s*:\s*\[([^\]]+)\]$/.exec(inner)
    if (span) return { kind: 'table', table: name, from: span[1]!.trim(), to: span[2]!.trim() }
    const column = inner.replace(/^\[(.*)\]$/, '$1').trim()
    return column && !/[[\]]/.test(column)
      ? { kind: 'table', table: name, from: column, to: column } : null
  }
  const bang = trimmed.lastIndexOf('!')
  const name = trimmed.slice(bang + 1).trim()
  if (!NAME.test(name)) return null
  if (bang < 0) return { kind: 'name', name }
  const sheet = trimmed.slice(0, bang).trim().replace(/^'(.*)'$/, '$1').replace(/''/g, '\'')
  return sheet ? { kind: 'name', name, sheet } : null
}

export interface SourceCatalog {
  readonly names: readonly NativeNamedRange[]
  readonly tables: readonly NativeTable[]
  /** `index` 是 Rust 的表序号（名称的 scope / target.sheet 用它）。 */
  readonly sheets: readonly { readonly id: string; readonly name: string; readonly index: number }[]
  readonly ownerId: string
}

export type SourceResolution =
  | { readonly status: 'ok'; readonly areas: DrawingRange[] }
  | { readonly status: 'error'; readonly error: string }

export const SOURCE_MISSING = 'The chart data table or name does not exist.'
const NOT_A_RANGE = 'The chart data name must refer to a range.'

const same = (a: string, b: string) => a.toUpperCase() === b.toUpperCase()

/** 对象所在表的区域不记 sheetId，其他表记上（同 DrawingRange 约定）。 */
function onSheet(range: DrawingRange, sheetId: string, ownerId: string): DrawingRange {
  return sheetId === ownerId ? range : { ...range, sheetId }
}

function resolveTable(ref: Extract<ChartSourceRef, { kind: 'table' }>,
  catalog: SourceCatalog): SourceResolution {
  const table = catalog.tables.find((entry) => same(entry.name, ref.table))
  const sheet = table && catalog.sheets.find((entry) => same(entry.name, table.sheet))
  const range = table && parseRangeText(table.range)
  if (!table || !sheet || !range) return { status: 'error', error: SOURCE_MISSING }
  // 汇总行不是数据；标题行保留，作系列名。
  const body = { ...range, endRow: range.endRow - (table.hasTotals ? 1 : 0) }
  if (!ref.from) return { status: 'ok', areas: [onSheet(body, sheet.id, catalog.ownerId)] }
  const at = (name: string) => table.columns.findIndex((column) => same(column, name))
  const [from, to] = [at(ref.from), at(ref.to ?? ref.from)]
  if (from < 0 || to < 0) return { status: 'error', error: SOURCE_MISSING }
  const [left, right] = from <= to ? [from, to] : [to, from]
  return { status: 'ok', areas: [onSheet({ ...body, startCol: range.startCol + left,
    endCol: range.startCol + right }, sheet.id, catalog.ownerId)] }
}

/** 名称查找同 Excel：先找所在表（或写明的表）的工作表级名称，再找工作簿级名称。 */
function resolveName(ref: Extract<ChartSourceRef, { kind: 'name' }>,
  catalog: SourceCatalog): SourceResolution {
  const scope = ref.sheet === undefined
    ? catalog.sheets.find((entry) => entry.id === catalog.ownerId)?.index
    : catalog.sheets.find((entry) => same(entry.name, ref.sheet!))?.index
  const matches = catalog.names.filter((entry) => same(entry.name, ref.name))
  const entry = matches.find((item) => scope !== undefined && item.scope === scope) ??
    matches.find((item) => item.scope == null)
  if (!entry) {
    // 表格名与名称共用命名空间：`Table1` 也是合法写法。
    return ref.sheet === undefined ? resolveTable({ kind: 'table', table: ref.name }, catalog)
      : { status: 'error', error: SOURCE_MISSING }
  }
  const target = entry.target
  const sheet = target && catalog.sheets.find((item) => item.index === target.sheet)
  if (entry.formula != null || !target || !sheet) return { status: 'error', error: NOT_A_RANGE }
  const [startRow, startCol, endRow, endCol] = target.range
  return { status: 'ok',
    areas: [onSheet({ startRow, startCol, endRow, endCol }, sheet.id, catalog.ownerId)] }
}

export function resolveChartSource(text: string, catalog: SourceCatalog): SourceResolution {
  const ref = parseChartSource(text)
  if (!ref) return { status: 'error', error: SOURCE_MISSING }
  return ref.kind === 'table' ? resolveTable(ref, catalog) : resolveName(ref, catalog)
}

/** 选区正好是某个表格（含标题、不含汇总行）时返回表名：同 Excel，由表格建的图表随表格扩展。 */
export function tableOfArea(area: DrawingRange, catalog: SourceCatalog): string | null {
  const key = (range: DrawingRange) => JSON.stringify([range.sheetId ?? catalog.ownerId,
    range.startRow, range.startCol, range.endRow, range.endCol])
  const target = key(area)
  const table = catalog.tables.find((entry) => {
    const resolved = resolveTable({ kind: 'table', table: entry.name }, catalog)
    return resolved.status === 'ok' && resolved.areas.length === 1 &&
      key(resolved.areas[0]!) === target
  })
  return table?.name ?? null
}
