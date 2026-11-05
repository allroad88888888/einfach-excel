import { inspectSpill } from '../spill-commands'
import {
  recalculateWorkbook,
  setWorkbookCalculationMode,
  setWorkbookIterativeCalculation,
} from '../quick-formula-commands'
import { selectSpecialQuery } from '../select-special-io'
import { findWorkbook } from '../find-io'
import { readVisibleProjection } from '../visible-projection'
import type { WorkbookHandlers } from './context'

/** 公式计算控制与不改工作簿内容的只读查询。 */
export const queryHandlers: WorkbookHandlers = {
  'formula.awaitAsync': context => context.asyncFormulas!.awaitSettlement(),
  'formula.inspectSpill': (context, current, input) => ({
    inspection: inspectSpill(current, context.sheetIndex(input.sheetId), input.cell),
    revision: context.revision,
  }),
  'formula.recalculate': (context, current, input) => {
    const out = recalculateWorkbook(current, context.sheetIndex, input, context.revision)
    context.revision = out.nextRevision; return out.reply
  },
  'formula.setCalculationMode': (context, current, input) => {
    const out = setWorkbookCalculationMode(current, context.sheetIndex, input, context.revision)
    context.revision = out.nextRevision; return out.reply
  },
  'formula.setIterativeCalculation': (context, current, input) => {
    const out = setWorkbookIterativeCalculation(
      current, context.sheetIndex, input, context.revision)
    context.revision = out.nextRevision; return out.reply
  },
  'formula.suggest': (context, current, input) => {
    const index = context.sheetIndex(input.sheetId)
    const sheet = context.sheetsById.get(input.sheetId)!
    if (!current.suggest_quick_formula) throw new Error('Rust quick formula is unavailable.')
    // 原生只读建议不推进修订号；确认草稿复用 cell.setInput。
    return { ...current.suggest_quick_formula({
      sheet: index, range: input.range, function: input.function,
      rowCount: sheet.rowCount ?? 1_048_576, colCount: sheet.colCount ?? 16_384,
    }), revision: context.revision }
  },
  'format.preview': (context, current, input) => {
    if (!current.preview_number_format) throw new Error('Rust number format preview is unavailable.')
    // 只读单格结果，不推进修订号，也不发布投影或创建历史事务。
    return current.preview_number_format(
      context.sheetIndex(input.sheetId), input.addr, input.numberFormat,
    )
  },
  'selection.aggregate': (context, current, input) => {
    if (!current.aggregate_selection) throw new Error('Rust aggregate command is unavailable.')
    const targets = input.targets.map(({ sheetId, range }) => ({
      ...range,
      sheet: context.sheetIndex(sheetId),
    }))
    return { ...current.aggregate_selection(targets), revision: context.revision }
  },
  'selection.visibleBlocks': (context, current, input) => selectSpecialQuery(
    current, 'selection.visibleBlocks', input, context.sheetIndex, context.revision),
  'selection.currentRegion': (context, current, input) => selectSpecialQuery(
    current, 'selection.currentRegion', input, context.sheetIndex, context.revision),
  'workbook.locate': (context, current, { sheetId, ...input }) => {
    if (!current.locate_cells) throw new Error('Rust locate command is unavailable.')
    return { ...current.locate_cells({ ...input, sheet: context.sheetIndex(sheetId) }),
      revision: context.revision }
  },
  'workbook.find': (context, current, input) =>
    findWorkbook(current, context.sheetsById, input, context.revision),
  'projection.readVisible': (context, current, { request }) => readVisibleProjection(
    current,
    context.sheetIndex(request.sheetId),
    request,
    request.revision ?? context.revision,
  ),
}
