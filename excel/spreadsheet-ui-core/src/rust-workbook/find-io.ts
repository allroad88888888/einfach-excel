import type { RustFindRequest, RustReplaceRequest } from './find-commands'
import type { RustWorkbookSheet } from './commands'
import type { WasmWorkbook } from './wasm-types'

function nativeTargets(
  sheets: ReadonlyMap<string, RustWorkbookSheet>,
  request: Pick<RustFindRequest, 'targets'>,
) {
  return request.targets.map(({ sheetId, range }) => ({
    ...range,
    sheet: requireSheet(sheets, sheetId).index,
  }))
}

function requireSheet(sheets: ReadonlyMap<string, RustWorkbookSheet>, id: string) {
  const sheet = sheets.get(id)
  if (!sheet || sheet.index < 0) throw new Error(`Unknown sheet: ${id}`)
  return sheet
}

/** 查找只返回匹配坐标及当前修订版，不发布全表数据或改变可见窗口。 */
export function findWorkbook(
  workbook: WasmWorkbook,
  sheets: ReadonlyMap<string, RustWorkbookSheet>,
  request: RustFindRequest,
  revision: number,
) {
  if (!workbook.find_cells) throw new Error('Rust find command is unavailable.')
  const page = workbook.find_cells({
    targets: nativeTargets(sheets, request),
    query: request.query,
    offset: request.offset,
    limit: request.limit,
  })
  const ids = new Map([...sheets.values()].map((sheet) => [sheet.index, sheet.id]))
  return {
    total: page.total,
    revision,
    matches: page.matches.map(({ sheet, ...match }) => {
      const sheetId = ids.get(sheet)
      if (!sheetId) throw new Error('Find returned an unknown worksheet.')
      return { ...match, sheetId }
    }),
  }
}

/** 查询版本已变化就拒绝写入；只返回原生写入结果，调用方立即推进修订版。 */
export function replaceWorkbook(
  workbook: WasmWorkbook,
  sheets: ReadonlyMap<string, RustWorkbookSheet>,
  request: RustReplaceRequest,
  revision: number,
) {
  if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision !== revision)
    throw new Error('The workbook changed. Find again before replacing.')
  if (
    !workbook.replace_by_query ||
    !workbook.read_sparse_range ||
    !workbook.snapshot_format_range ||
    !workbook.snapshot_viewport_sizes
  )
    throw new Error('Rust replace projection is unavailable.')
  requireSheet(sheets, request.projection.sheetId)
  const current = request.current
  return workbook.replace_by_query({
    targets: nativeTargets(sheets, request),
    query: request.query,
    replacement: request.replacement,
    ...(current
      ? {
          current: {
            sheet: requireSheet(sheets, current.sheetId).index,
            row: current.row,
            col: current.col,
            start: current.start,
            end: current.end,
          },
        }
      : {}),
  })
}
