import { atom } from '@einfach/core'
import { nativeFilterFeedbackAtom, runNativeFilterAtom } from '../filter/command'
import { validFilterRange } from '../rust-workbook/filter-commands'
import { readWorksheetReference, worksheetCriteriaContextAtom, type WorksheetCriteriaDraft } from './reference'
import type { WorksheetCriteriaPreview } from './copy-command'

export const runWorksheetCriteriaAtom = atom(null, async (get, set, action: {
  readonly mode: 'in-place' | 'preview-copy'
  readonly draft: WorksheetCriteriaDraft
}): Promise<WorksheetCriteriaPreview | null> => {
  const context = get(worksheetCriteriaContextAtom)
  if (!context || context.editing) throw new Error('Finish the current worksheet operation first.')
  const { draft, mode } = action
  const source = readWorksheetReference(get, draft.source)
  if (!source || !validFilterRange(source.range)) throw new Error('Choose a source with a header and data rows.')
  const criteria = readWorksheetReference(get, draft.criteria)
  if (draft.criteria.trim() && (!criteria || !validFilterRange(criteria.range)))
    throw new Error('Choose a criteria range with a header and at least one criteria row.')
  const options = { uniqueOnly: draft.uniqueOnly, ...(criteria ? { criteria } : {}) }

  if (mode === 'in-place') {
    if (source.sheetId !== context.sheetId) throw new Error('Activate the source worksheet to filter it in place.')
    const applied = await set(runNativeFilterAtom, {
      action: 'apply', rules: [], range: source.range, rangeCriteria: options,
    })
    if (!applied)
      throw new Error(get(nativeFilterFeedbackAtom).error || 'The worksheet filter was not applied.')
    return null
  }

  const target = readWorksheetReference(get, draft.destination)
  if (!target || target.range.rowStart !== target.range.rowEnd ||
    target.range.colStart !== target.range.colEnd)
    throw new Error('Choose a single destination cell for the filtered records.')
  const outputFields = draft.outputFields.split('\n').map((field) => field.replace(/\r$/, ''))
    .filter((field) => field.trim().length > 0)
  const request = { ...options, source, sheetId: target.sheetId, outputFields,
    destination: { row: target.range.rowStart, col: target.range.colStart } }
  const preview = await context.connection.request('advancedFilter.previewCopy', request)
  return { ...preview, request }
})
runWorksheetCriteriaAtom.debugLabel = 'spreadsheet.advancedFilter.run'
