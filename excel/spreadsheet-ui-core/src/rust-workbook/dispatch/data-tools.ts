import { applyRemoveDuplicates, previewRemoveDuplicates } from '../remove-duplicates-io'
import { applyTextColumns, previewTextColumns } from '../text-columns-io'
import { changeFilter, readFilterValues } from '../filter-io'
import { sortRange } from '../sort-io'
import { replaceWorkbook } from '../find-io'
import { readSizes } from '../size-io'
import { readVisibleProjection } from '../visible-projection'
import type { WorkbookHandlers } from './context'

/** 数据工具：删除重复项、分列、筛选、排序与替换。 */
export const dataToolHandlers: WorkbookHandlers = {
  'duplicates.preview': (context, current, input) => previewRemoveDuplicates(
    current, context.sheetsById.get(input.sheetId), input, context.revision),
  'duplicates.apply': (context, current, input) => {
    const result = applyRemoveDuplicates(
      current, context.sheetsById.get(input.sheetId), input, context.revision)
    if (result.removedRows > 0) context.revision += 1
    return { ...result,
      projection: readVisibleProjection(
        current, context.sheetIndex(input.sheetId), input.projection, context.revision,
      ) }
  },
  'textColumns.preview': (context, current, input) => previewTextColumns(
    current, context.sheetsById.get(input.sheetId), input, context.revision),
  'textColumns.apply': (context, current, input) => {
    const result = applyTextColumns(
      current, context.sheetsById.get(input.sheetId), input, context.revision)
    // 写入完成就推进版本；即使投影失败，也不能拿旧预览再次覆盖。
    if (result.changedCells > 0) context.revision += 1
    return {
      ...result,
      projection: readVisibleProjection(
        current, context.sheetIndex(input.sheetId), input.projection, context.revision,
      ),
    }
  },
  'sheet.filterValues': (context, current, input) => readFilterValues(
    current, context.sheetsById.get(input.sheetId), input, context.revision),
  'sheet.filter': (context, current, input) => {
    const index = context.sheetIndex(input.sheetId)
    const columns = context.sheetsById.get(input.sheetId)!.colCount ?? 16_384
    const hiddenRows = changeFilter(
      current, index, columns, input, context.sheetsById.get(input.sheetId)!.rowCount,
    )
    context.revision += 1
    return {
      hiddenRows,
      projection: readVisibleProjection(current, index, input.projection, context.revision),
    }
  },
  'range.sort': (context, current, input) => {
    const index = context.sheetIndex(input.sheetId)
    const movedRows = sortRange(current, index, input)
    if (movedRows > 0) {
      context.revision += 1
      // 剪切快照的坐标不再代表原记录；排序后必须重新剪切。
      if (context.clipboard?.cut) context.clipboard.invalidated = true
    }
    return {
      movedRows,
      projection: readVisibleProjection(current, index, input.projection, context.revision),
    }
  },
  'workbook.replace': (context, current, input) => {
    const result = replaceWorkbook(current, context.sheetsById, input, context.revision)
    // 写入完成即推进版本；后面的投影读取失败也不能让旧查询再次写入。
    if (result.cells > 0) context.revision += 1
    const index = context.sheetIndex(input.projection.sheetId)
    return {
      ...result,
      projection: readVisibleProjection(current, index, input.projection, context.revision),
      sizes: readSizes(current, index, {
        rowStart: 0,
        colStart: 0,
        rowEnd: 1_048_575,
        colEnd: 16_383,
      }),
    }
  },
}
