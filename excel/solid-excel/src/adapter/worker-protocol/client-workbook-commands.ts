import type { WorkerRpcRequest } from './client-request'
import type {
  AutoFillReportWire,
  AutoFillRequestWire,
  CellWire,
  FormulaMutationResultWire,
  SparseRangeWire,
  WorkbookSheetMeta,
} from './cell-range'
import type { CellFormatJSON, FormatRangeSnapshot } from './format'
import type { NameBindingWire } from './client-contract'
import type { SortRangePayloadWire, SortRangeReportWire } from './table-filter'
import type { ConditionalFormatConfigSnapshotWire, PrintConfigSnapshotWire, RemoveConditionalFormatRuleWire, SetConditionalFormatRuleWire, WorkerRuntimeCapabilitiesResponseWire } from './persistence-capability'

export function createWorkbookCommands(request: WorkerRpcRequest) {
  return {
    initWorkbook: (sheets: string[]) => request<WorkbookSheetMeta[]>('initWorkbook', { sheets }),
    async describeCapabilities() {
      try { return await request<WorkerRuntimeCapabilitiesResponseWire>('describeCapabilities') } catch (err) {
        if ((err as Error & { code?: string }).code === 'UNKNOWN_COMMAND') return null
        throw err
      }
    },
    sheetList: () => request<WorkbookSheetMeta[]>('sheetList'),
    getPrintConfig: (sheet: number) => request<PrintConfigSnapshotWire>('getPrintConfig', { sheet }),
    setPrintConfig: (sheet: number, config: PrintConfigSnapshotWire['config']) => request<PrintConfigSnapshotWire>('setPrintConfig', { sheet, config }),
    listConditionalFormats: (sheet: number) => request<ConditionalFormatConfigSnapshotWire>('listConditionalFormats', { sheet }),
    setConditionalFormatRule: (sheet: number, conditionalFormat: SetConditionalFormatRuleWire) => request<ConditionalFormatConfigSnapshotWire>('setConditionalFormatRule', { sheet, conditionalFormat }),
    removeConditionalFormatRule: (sheet: number, conditionalFormat: RemoveConditionalFormatRuleWire) => request<ConditionalFormatConfigSnapshotWire>('removeConditionalFormatRule', { sheet, conditionalFormat }),
    addSheet: (name: string) => request<number>('addSheet', { name }),
    renameSheet: (sheet: number, name: string) => request<boolean>('renameSheet', { sheet, name }),
    removeSheet: (sheet: number) => request<boolean>('removeSheet', { sheet }),
    moveSheet: (from: number, to: number) => request<boolean>('moveSheet', { from, to }),
    setCell: (sheet: number, addr: string, value: CellWire) => request<boolean>('setCell', { sheet, addr: addr.toUpperCase(), value }),
    setFormula: (sheet: number, addr: string, formula: string) => request<boolean>('setFormula', { sheet, addr: addr.toUpperCase(), formula }),
    setFormulaDetailed: (sheet: number, addr: string, formula: string) => request<FormulaMutationResultWire>('setFormulaDetailed', { sheet, addr: addr.toUpperCase(), formula }),
    clearCell: (sheet: number, addr: string) => request<boolean>('clearCell', { sheet, addr: addr.toUpperCase() }),
    clearRange: (range: SparseRangeWire) => request<number>('clearRange', { range }),
    applyAutoFill: (payload: AutoFillRequestWire) => request<AutoFillReportWire>('applyAutoFill', { request: payload }),
    insertRows: (sheet: number, rowIndex: number, count: number) => request<boolean>('insertRows', { sheet, rowIndex, count }),
    deleteRows: (sheet: number, rowIndex: number, count: number) => request<boolean>('deleteRows', { sheet, rowIndex, count }),
    insertColumns: (sheet: number, colIndex: number, count: number) => request<boolean>('insertColumns', { sheet, colIndex, count }),
    deleteColumns: (sheet: number, colIndex: number, count: number) => request<boolean>('deleteColumns', { sheet, colIndex, count }),
    setFormatRange: (range: SparseRangeWire, fmt: CellFormatJSON) => request<number>('setFormatRange', { range, fmt }),
    snapshotFormatRange: (range: SparseRangeWire) => request<FormatRangeSnapshot>('snapshotFormatRange', { range }),
    restoreFormatSnapshot: (snapshot: FormatRangeSnapshot) => request<number>('restoreFormatSnapshot', { snapshot }),
    sortRange: (sheet: number, payload: SortRangePayloadWire) => request<SortRangeReportWire>('sortRange', { sheet, payload }),
    setEvalHiddenRows: (sheet: number, rows: readonly number[]) => request<void>('setEvalHiddenRows', { sheet, rows: [...rows] }),
    setEvalFilterHiddenRows: (sheet: number, rows: readonly number[]) => request<void>('setEvalFilterHiddenRows', { sheet, rows: [...rows] }),
    registerCustomFormula: (name: string, source: string, options?: { isAsync?: boolean }) => request<boolean>('registerCustomFormula', { name, source, isAsync: options?.isAsync === true }),
    unregisterCustomFormula: (name: string) => request<boolean>('unregisterCustomFormula', { name }),
    defineName: (name: string, binding: NameBindingWire) => request<boolean>('defineName', { name, binding }),
    undefineName: (name: string) => request<boolean>('undefineName', { name }),
  }
}
