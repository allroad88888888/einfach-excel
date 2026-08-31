// 一句话：worker 后端对外暴露的选项与实例类型。

import type {
  ProjectionRevision,
  RemoveRowsExactRequest,
  RemoveRowsExactResult,
  SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import type { WorkerLike, WorkerWorkbookClient } from '../worker-protocol'

export interface WorkerWorkbookBackendSheetInput {
  id?: string
  name: string
}

export interface WorkerWorkbookSpreadsheetBackendOptions {
  client?: WorkerWorkbookClient
  workerFactory?: () => WorkerLike
  sheets?: readonly (string | WorkerWorkbookBackendSheetInput)[]
  revision?: ProjectionRevision
  /**
   * Explicit host witness that this worker runtime really applies deleteRows.
   * Omitted/false by default because the current TS runtime ACKs structural
   * commands without mutating its workbook. Only the WASM demo may opt in.
   */
  removeRowsExactCapability?: false | 'worker-engine-delete-rows'
  afterInit?: (
    client: WorkerWorkbookClient,
    sheets: WorkerWorkbookBackendSheet[],
  ) => Promise<void> | void
}

export interface WorkerWorkbookSpreadsheetBackend extends SpreadsheetBackend {
  removeRowsExact?(request: RemoveRowsExactRequest): Promise<RemoveRowsExactResult>
  ready(): Promise<WorkerWorkbookBackendSheet[]>
  sheets(): WorkerWorkbookBackendSheet[]
  dispose(): void
}

export interface WorkerWorkbookBackendSheet {
  id: string
  idx: number
  name: string
}

export type SheetLookup = {
  sheets: WorkerWorkbookBackendSheet[]
  byId: Map<string, WorkerWorkbookBackendSheet>
}
