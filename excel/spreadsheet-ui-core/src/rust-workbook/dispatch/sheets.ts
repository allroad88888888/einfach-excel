import { changeSheetStructure } from '../sheet-structure'
import { editWorkbookSheet } from '../sheet-edit'
import {
  duplicateWorkbookSheet,
  setWorkbookSheetHidden,
  setWorkbookSheetTabColor,
} from '../sheet-management'
import { exportWorkbookFile } from '../file-io'
import { importTables } from '../table-commands'
import { readVisibleProjection } from '../visible-projection'
import type { WorkbookHandlers } from './context'

/** 工作簿级操作：工作表增删改移、导入导出。 */
export const sheetHandlers: WorkbookHandlers = {
  'workbook.changeSheets': (context, current, input) => {
    const sheets = changeSheetStructure(current, context.sheetsById, input)
    context.painterToken = undefined
    context.revision += 1
    return {
      sheets,
      revision: context.revision,
      ...(input.projection
        ? {
            projection: readVisibleProjection(
              current,
              context.sheetIndex(input.projection.sheetId),
              input.projection,
              context.revision,
            ),
          }
        : {}),
    }
  },
  'workbook.duplicateSheet': (context, current, input) => {
    const result = duplicateWorkbookSheet(current, context.sheetsById, input, context.revision)
    context.painterToken = undefined
    context.revision = result.revision
    return result
  },
  'workbook.setSheetHidden': (context, current, input) => {
    const result = setWorkbookSheetHidden(current, context.sheetsById, input, context.revision)
    context.painterToken = undefined
    context.revision = result.revision
    return result
  },
  'workbook.setSheetTabColor': (context, current, input) => {
    const result = setWorkbookSheetTabColor(current, context.sheetsById, input, context.revision)
    context.painterToken = undefined
    context.revision = result.revision
    return result
  },
  'workbook.editSheet': (context, current, input) => {
    const result = editWorkbookSheet(current, context.sheetsById, input, context.revision + 1)
    context.painterToken = undefined
    context.revision += 1
    return result
  },
  'workbook.exportFile': (context, current, input) =>
    exportWorkbookFile(current, [...context.sheetsById.values()], input.title),
  'workbook.importCells': (context, current, input) => {
    const stats = current.bulk_import_cells(input.cells)
    importTables(current, context.sheetsById, input.tables ?? [])
    current.history_clear?.('')
    return stats
  },
}
