// 一句话：建立一个 worker 后端会话状态并跑完 runtime 能力握手。

import { createWorkerWorkbook } from '../worker-protocol'
import type { WorkerWorkbookClient } from '../worker-protocol'
import { buildSheetLookup, normalizeSheetInputs } from './sheet-lookup'
import type { WorkerBackendState } from './state'
import type { WorkerWorkbookSpreadsheetBackendOptions } from './types'

export function createWorkerBackendState(
  options: WorkerWorkbookSpreadsheetBackendOptions,
): WorkerBackendState {
  const resolvedClient =
    options.client ??
    (options.workerFactory ? createWorkerWorkbook({ workerFactory: options.workerFactory }) : null)

  if (!resolvedClient) {
    throw new Error('createWorkerWorkbookSpreadsheetBackend requires client or workerFactory')
  }

  const sheetInputs = normalizeSheetInputs(options.sheets)
  const client: WorkerWorkbookClient = resolvedClient
  const state: WorkerBackendState = {
    options,
    client,
    readyPromise: Promise.resolve([]),
    lookup: { sheets: [], byId: new Map() },
    revision: options.revision ?? 0,
    autoFillOpaqueRevisionNamespace: null,
    autoFillOpaqueRevisionEpoch: 0n,
    disposed: false,
    validationRulesBySheetId: new Map(),
    conditionalFormatRulesBySheetId: new Map(),
    mergeRangesBySheetId: new Map(),
    filterSortStateBySheetId: new Map(),
    filterHiddenRowsBySheetId: new Map(),
    undoRecords: [],
    redoRecords: [],
    namedRanges: [],
    namedRangeMutationTail: Promise.resolve(),
    autoFillMutationTail: Promise.resolve(),
    runtimeCapabilities: null,
    autoFillCapability: false,
    contentChangeHandlers: new Set(),
    sheetIndexRemapDepth: 0,
    deferredContentChange: false,
    autoFillNativeMutationRanges: [],
    deferredAutoFillContentChange: false,
    offDirty: () => {},
  }

  state.readyPromise = client
    .initWorkbook(sheetInputs.map((sheet) => sheet.name))
    .then(async (metas) => {
      state.lookup = buildSheetLookup(sheetInputs, metas)
      const declared = (await client.describeCapabilities?.()) ?? null
      // AutoFill never inherits the legacy `null => trust` convention. A
      // concrete runtime must both advertise the native transaction and
      // expose its RPC method. WASM sends a scoped AutoFill-only witness;
      // full capability declarations (the TS runtime) continue to gate the
      // older families exactly as before.
      state.autoFillCapability = declared?.autoFill === true
      state.runtimeCapabilities =
        declared !== null && 'structuralEdits' in declared ? declared : null
      await options.afterInit?.(client, state.lookup.sheets)
      return state.lookup.sheets
    })

  return state
}
