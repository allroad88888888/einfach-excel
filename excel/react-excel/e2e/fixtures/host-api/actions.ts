import type { WorkbookApi, WorkbookOperation } from '@einfach-excel/spreadsheet-ui-core'

export const range = { rowStart: 2, rowEnd: 2, colStart: 2, colEnd: 2 }
export const target = { sheetId: 'other', range }
const numbers = { sheetId: 'other', range: { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 0 } }
const query = { needle: 'Target', caseSensitive: true, wholeCell: true, lookIn: 'values' as const }

export function actions(api: WorkbookApi) {
  const execute = (input: WorkbookOperation) => () => api.execute(input)
  return {
    'Format': () => api.format({ ...target, format: { bold: true } }),
    'Clear': () => api.clear({ ...target, mode: 'contents' }),
    'Shift': () => api.shiftCells({ ...target, direction: 'insert-right' }),
    'Resize': () => api.resize({ ...target, axis: 'column', pixels: 180 }),
    'Hide row': () => api.visibility({ ...target, action: 'hide-rows' }),
    'Insert row': () => api.structure({ sheetId: 'other', edit: { action: 'insert-rows', at: 1, count: 1 } }),
    'Freeze': () => api.freeze({ sheetId: 'other', rows: 1, cols: 1 }),
    'Merge': () => api.merge({ ...target, range: { ...range, rowEnd: 3 }, action: 'merge' }),
    'Sort': () => api.sort({ ...numbers, keys: [{ col: 0, direction: 'asc' }], hasHeader: true }),
    'Filter': () => api.filter({ ...numbers, action: 'apply', rules: [
      { colIndex: 0, kind: 'range', min: 2 },
    ] }),
    'Conditional format': () => api.conditionalFormat({ sheetId: 'other', action: 'set', priority: 0,
      scope: { range: numbers.range }, rule: { kind: 'cell-value', operator: 'gt', value: '1',
        format: { bold: true } } }),
    'Validation': () => api.validation({ ...target, rule: { kind: 'list', items: ['Target', 'Accepted'],
      ignoreBlank: true } }),
    'Add sheet': () => api.addSheet({ name: 'Added', rowCount: 200, colCount: 20 }),
    'Rename sheet': () => api.renameSheet({ sheetId: 'other', name: 'Renamed' }),
    'Copy sheet': () => api.copySheet({ sheetId: 'other' }),
    'Move sheet': () => api.moveSheet({ sheetId: 'other', targetIndex: 0 }),
    'Hide sheet': () => api.hideSheet({ sheetId: 'other', hidden: true }),
    'Color sheet': () => api.colorSheet({ sheetId: 'other', color: '#ff0000' }),
    'Delete sheet': () => api.deleteSheet({ sheetId: 'other' }),
    'Undo': () => api.undo(), 'Redo': () => api.redo(),
    'Find': () => api.find({ targets: [target], query, offset: 0, limit: 10 }),
    'Replace': async () => {
      const found = await api.find({ targets: [target], query, offset: 0, limit: 10 })
      return found.status === 'ok' ? api.replace({ targets: [target], query,
        replacement: 'Replaced', expectedRevision: found.revision }) : found
    },
    'Select other': () => api.select(target),
    'Activate main': () => api.activateSheet('main'),
    'Scroll': () => api.scrollTo(80, 5), 'Zoom': () => api.zoom(125),
    'Begin edit': () => api.beginEditing(),
    'Set draft': () => { api.setDraft('Edited by host'); return { status: 'ok' } },
    'Commit edit': () => api.commitEditing(),
    'Cancel edit': () => { api.cancelEditing(); return { status: 'ok' } },
    'Addresses': () => ({ cell: api.coordToA1({ row: 2, col: 2 }), range: api.rangeToA1(range),
      parsed: api.parseA1Range('C3:D4') }),
    'Read only': () => api.configure({ readOnly: true }),
    'Busy': () => api.configure({ busy: true }),
    'Lock structure': () => api.configure({ allowSheetStructure: false }),
    'Invalid target': execute({ type: 'clear', sheetId: 'missing', range, mode: 'all' }),
  }
}
