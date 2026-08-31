import type { WorkerRpcRequest } from './client-request'
import type { ColumnFilterRuleWire, FilterApplyResultWire, FilterSnapshotWire, HiddenRowsSnapshotWire, SheetFilterStateWire, SortRangeBoundsWire, TableJSONWire, TableRegistrySnapshotWire } from './table-filter'

export function createTableFilterCommands(request: WorkerRpcRequest) {
  return {
    createTable: (sheet: number, bounds: SortRangeBoundsWire, name?: string) => request<string>('createTable', { sheet, bounds, ...(name === undefined ? {} : { name }) }),
    renameTable: (name: string, newName: string) => request<void>('renameTable', { name, newName }),
    renameTableColumn: (name: string, oldColumn: string, newColumn: string) => request<void>('renameTableColumn', { name, oldColumn, newColumn }),
    deleteTable: (name: string) => request<void>('deleteTable', { name }),
    listTables: () => request<TableJSONWire[]>('listTables'),
    getTable: (name: string) => request<TableJSONWire | null>('getTable', { name }),
    setTableTotalsRow: (name: string, enabled: boolean) => request<void>('setTableTotalsRow', { name, enabled }),
    setTableTotalFunction: (name: string, column: string, func: string) => request<void>('setTableTotalFunction', { name, column, func }),
    snapshotTables: () => request<TableRegistrySnapshotWire>('snapshotTables'),
    restoreTables: (snapshot: TableRegistrySnapshotWire) => request<number>('restoreTables', { snapshot }),
    applyFilter: (sheet: number, rules: readonly ColumnFilterRuleWire[]) => request<FilterApplyResultWire>('applyFilter', { sheet, rules: [...rules] }),
    reapplyFilter: (sheet: number) => request<FilterApplyResultWire>('reapplyFilter', { sheet }),
    clearFilter: (sheet: number) => request<FilterApplyResultWire>('clearFilter', { sheet }),
    getFilter: (sheet: number) => request<SheetFilterStateWire>('getFilter', { sheet }),
    hideRows: (sheet: number, rows: readonly number[]) => request<boolean>('hideRows', { sheet, rows: [...rows] }),
    unhideRows: (sheet: number, rows: readonly number[]) => request<boolean>('unhideRows', { sheet, rows: [...rows] }),
    listHiddenRows: (sheet: number) => request<number[]>('listHiddenRows', { sheet }),
    snapshotHidden: () => request<HiddenRowsSnapshotWire>('snapshotHidden'),
    restoreHidden: (snapshot: HiddenRowsSnapshotWire) => request<number>('restoreHidden', { snapshot }),
    snapshotFilters: () => request<FilterSnapshotWire>('snapshotFilters'),
    restoreFilters: (snapshot: FilterSnapshotWire) => request<number>('restoreFilters', { snapshot }),
  }
}
