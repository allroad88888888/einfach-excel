import { readComment, changeComment } from '../comments/command'
import { readCustomFormulas, changeCustomFormula } from '../custom-formulas/command'
import { changeRichText } from '../rich-text-command'
import { changeHyperlink } from '../hyperlink/command'
import { readNote, changeNote } from '../notes/command'
import { readProtection, changeProtection } from '../protection/commands'
import { changeNamedRange } from '../named-range-commands'
import { changeTable } from '../table-commands'
import { changeDataValidation } from '../data-validation-commands'
import { changeConditionalFormat } from '../conditional-format-io'
import { changeOutline } from '../outline-io'
import { readVisibleProjection } from '../visible-projection'
import type { WorkbookHandlers } from './context'

/** 单元格附属数据与工作表元数据：批注、备注、保护、链接、表、名称、验证、条件格式、分级。 */
export const metadataHandlers: WorkbookHandlers = {
  'customFormula.read': (context, current, input) => ({
    definitions: readCustomFormulas(current, input, context.revision),
    revision: context.revision,
  }),
  'customFormula.change': (context, current, input) => {
    const result = context.projectChange(
      changeCustomFormula(current, context.sheetsById, input, context.revision), input)
    return { ...result,
      definitions: readCustomFormulas(current, { revision: context.revision }, context.revision) }
  },
  'notes.read': (context, current, input) =>
    ({ text: readNote(current, context.sheetsById, input, context.revision),
      revision: context.revision }),
  'notes.change': (context, current, input) =>
    context.projectChange(changeNote(current, context.sheetsById, input, context.revision), input),
  'comments.read': (context, current, input) =>
    ({ thread: readComment(current, context.sheetsById, input, context.revision),
      revision: context.revision }),
  'comments.change': (context, current, input) => {
    const result = context.projectChange(
      changeComment(current, context.sheetsById, input, context.revision), input)
    return {
      ...result,
      thread: readComment(current, context.sheetsById,
        { ...input, revision: context.revision }, context.revision),
    }
  },
  'protection.read': (context, current, input) =>
    readProtection(current, context.sheetsById, input),
  'protection.change': (context, current, input) => {
    const result = context.projectChange(
      changeProtection(current, context.sheetsById, input, context.revision), input)
    return { ...result, protection: readProtection(current, context.sheetsById, input) }
  },
  'richText.change': (context, current, input) =>
    context.projectChange(
      changeRichText(current, context.sheetsById, input, context.revision), input),
  'hyperlink.change': (context, current, input) =>
    context.projectChange(
      changeHyperlink(current, context.sheetsById, input, context.revision), input),
  'table.change': (context, current, input) =>
    context.projectChange(changeTable(current, context.sheetsById, input, context.revision), input),
  'namedRange.change': (context, current, input) =>
    context.projectChange(
      changeNamedRange(current, context.sheetsById, input, context.revision), input),
  'validation.read': (context, current, input) => {
    if (!current.getDataValidation) throw new Error('Rust data validation is unavailable.')
    return current.getDataValidation(context.sheetIndex(input.sheetId), input.row, input.col)
  },
  'validation.change': (context, current, input) => {
    const sheet = context.sheetsById.get(input.sheetId)
    const index = context.sheetIndex(input.sheetId)
    changeDataValidation(
      current, index, input, sheet?.rowCount ?? 1_048_576, sheet?.colCount ?? 16_384)
    context.revision += 1
    return { projection: readVisibleProjection(current, index, input.projection, context.revision) }
  },
  'conditionalFormat.change': (context, current, input) => {
    const index = context.sheetIndex(input.sheetId)
    const sheet = context.sheetsById.get(input.sheetId)!
    changeConditionalFormat(
      current, index, input, sheet.rowCount ?? 1_048_576, sheet.colCount ?? 16_384,
    )
    context.revision += 1
    return { projection: readVisibleProjection(current, index, input.projection, context.revision) }
  },
  'outline.change': (context, current, input) => {
    context.sheetIndex(input.sheetId)
    const changed = changeOutline(
      current, context.sheetsById.get(input.sheetId)!, input, context.revision)
    return context.projectChange(changed, input)
  },
}
