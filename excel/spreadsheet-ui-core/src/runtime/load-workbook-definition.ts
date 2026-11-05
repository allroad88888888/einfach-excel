import type { RustWorkbookConnection } from '../rust-workbook'
import type { WorkbookDocumentSheet } from './workbook-document'
import type { RustWorkbookDefinition } from './rust-workbook-definition'
import { createVisibleProjectionRequest, validateProjectionResult } from '../projection/contracts'
import { validNativeProtection } from '../rust-workbook/protection/commands'
import type { SheetProtectionBySheet, SheetProtectionState } from '../protection/types'

export interface LoadedWorkbook {
  readonly title: string
  readonly sheets: readonly WorkbookDocumentSheet[]
  readonly protectionBySheet?: SheetProtectionBySheet
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
        ...(sheet.defaults ? { defaults: sheet.defaults } : {}),
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
    // 先导入全部内容再锁定，复用原生保护命令；页面发布前不会出现可写的中间状态。
    const protectionBySheet: Record<string, SheetProtectionState> = {}
    for (const sheet of definition.sheets.filter((entry) => entry.protected)) {
      const projection = createVisibleProjectionRequest({ sheetId: sheet.id, requestId: 1,
        window: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 } })
      const current = await connection.request('projection.readVisible', { request: projection })
      if (!owned()) return null
      if (current.revision === undefined ||
        !validateProjectionResult(current, { request: projection }).ok)
        throw new Error('Rust returned an invalid initial protection projection.')
      const saved = await connection.request('protection.change', {
        sheetId: sheet.id, change: { action: 'protect' }, revision: current.revision, projection,
      })
      if (!owned()) return null
      if (!validNativeProtection(saved.protection) || saved.protection.mode !== 'protected')
        throw new Error('Rust did not enable initial worksheet protection.')
      protectionBySheet[sheet.id] = saved.protection
    }
  return { title: definition.title, sheets: documentSheets,
    ...(Object.keys(protectionBySheet).length ? { protectionBySheet } : {}) }
}
