import type { RustWorkbookConnection } from '../rust-workbook'
import type { WorkbookDocumentSheet } from './workbook-document'
import type { RustWorkbookDefinition } from './rust-workbook-definition'

export interface LoadedWorkbook {
  readonly title: string
  readonly sheets: readonly WorkbookDocumentSheet[]
}

/**
 * 按宿主定义在新 Worker 里建簿：初始化表、分块导入单元格、再建 Table。
 * `owned()` 为假表示连接已被替换，返回 null 让调用方静默放弃。
 */
export async function loadWorkbookDefinition(
  connection: RustWorkbookConnection,
  definition: RustWorkbookDefinition,
  owned: () => boolean,
): Promise<LoadedWorkbook | null> {
    const initializedSheets = await connection.request('workbook.initialize', {
      // 定义已做完整快照与校验，直接传递，避免二次字段筛选遗漏初始元数据。
      sheets: definition.sheets,
      customFormulas: definition.customFormulas,
    })
    if (!owned()) return null
    if (initializedSheets.length !== definition.sheets.length) {
      throw new Error(
        `Rust initialized ${initializedSheets.length}/${definition.sheets.length} sheets`,
      )
    }
    const sheetDefinitions = new Map(definition.sheets.map((sheet) => [sheet.id, sheet]))
    const publishedSheetIds = new Set<string>()
    const documentSheets = initializedSheets.map((sheet) => {
      const source = sheetDefinitions.get(sheet.id)
      if (source === undefined || publishedSheetIds.has(sheet.id)) {
        throw new Error(`Rust initialized an unexpected sheet: ${sheet.id}`)
      }
      publishedSheetIds.add(sheet.id)
      return {
        id: sheet.id,
        name: sheet.name,
        index: sheet.index,
        ...(sheet.key ? { key: sheet.key } : {}),
        rowCount: source.rowCount,
        colCount: source.colCount,
      }
    })

    let expectedCells = 0
    let acceptedCells = 0
    let importErrors = 0
    let rejectedFormulas = 0
    for await (const chunk of definition.createImportChunks()) {
      if (!owned()) return null
      if (chunk.length === 0) continue
      expectedCells += chunk.length
      const stats = await connection.request('workbook.importCells', { cells: chunk })
      acceptedCells += stats.accepted
      importErrors += stats.errors
      rejectedFormulas += stats.rejectedFormulas
    }
    if (acceptedCells !== expectedCells || importErrors > 0 || rejectedFormulas > 0) {
      throw new Error(`Rust import accepted ${acceptedCells}/${expectedCells} cells`)
    }
    if (!owned()) return null

    // 表头已全部导入，再用同一原生命令建立 Table；这仍属于启动，不加入用户历史。
    const tables = definition.sheets.flatMap((sheet) =>
      (sheet.tables ?? []).map((table) => ({ ...table, sheetId: sheet.id })))
    if (tables.length) {
      await connection.request('workbook.importCells', { cells: [], tables })
      if (!owned()) return null
    }
  return { title: definition.title, sheets: documentSheets }
}
