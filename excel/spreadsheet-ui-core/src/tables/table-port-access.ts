import type { TablesControllerPort } from './types'

export function errorMessage(error: unknown): string {
  try {
    if (error instanceof Error && typeof error.message === 'string') return error.message
  } catch {
    // Fall through to guarded coercion.
  }
  try {
    return String(error)
  } catch {
    return 'Unknown table transport failure.'
  }
}

export function nextRequestId(sequence: number): number {
  return Number.isSafeInteger(sequence) && sequence < Number.MAX_SAFE_INTEGER ? sequence + 1 : 1
}

export function readCreateTablePort(source: TablesControllerPort): TablesControllerPort['createTable'] {
  try {
    const port = source?.createTable
    return typeof port === 'function' ? port : undefined
  } catch {
    return undefined
  }
}

export function readListTablesPort(source: TablesControllerPort): TablesControllerPort['listTables'] {
  try {
    const port = source?.listTables
    return typeof port === 'function' ? port : undefined
  } catch {
    return undefined
  }
}

export function readRenameTablePort(source: TablesControllerPort): TablesControllerPort['renameTable'] {
  try {
    const port = source?.renameTable
    return typeof port === 'function' ? port : undefined
  } catch {
    return undefined
  }
}

export function readRenameTableColumnPort(
  source: TablesControllerPort,
): TablesControllerPort['renameTableColumn'] {
  try {
    const port = source?.renameTableColumn
    return typeof port === 'function' ? port : undefined
  } catch {
    return undefined
  }
}

export function readDeleteTablePort(source: TablesControllerPort): TablesControllerPort['deleteTable'] {
  try {
    const port = source?.deleteTable
    return typeof port === 'function' ? port : undefined
  } catch {
    return undefined
  }
}

export function readSetTotalsRowPort(
  source: TablesControllerPort,
): TablesControllerPort['setTableTotalsRow'] {
  try {
    const port = source?.setTableTotalsRow
    return typeof port === 'function' ? port : undefined
  } catch {
    return undefined
  }
}

export function readSetTotalFunctionPort(
  source: TablesControllerPort,
): TablesControllerPort['setTableTotalFunction'] {
  try {
    const port = source?.setTableTotalFunction
    return typeof port === 'function' ? port : undefined
  } catch {
    return undefined
  }
}
