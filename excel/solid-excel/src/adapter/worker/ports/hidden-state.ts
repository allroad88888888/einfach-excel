// 一句话：引擎自持隐藏行状态端口。

import type {
  HideRowsRequest,
  SetEvalHiddenRowsRequest,
  SheetHiddenStateRequest,
  UnhideRowsRequest,
} from '@einfach/spreadsheet-ui-core'
import { runtimeSupports } from '../capabilities'
import {
  hideRowsThroughWorker,
  readSheetHiddenStateThroughWorker,
  setEvalHiddenRowsThroughWorker,
  unhideRowsThroughWorker,
} from '../hidden-rows'
import type { WorkerWorkbookSpreadsheetBackend } from '../types'
import type { WorkerBackendState } from '../state'

export function createHiddenStatePorts(
  state: WorkerBackendState,
): Pick<
  WorkerWorkbookSpreadsheetBackend,
  'readSheetHiddenState' | 'hideRows' | 'unhideRows' | 'setEvalHiddenRows'
> {
  const readSheetHiddenState = (request: SheetHiddenStateRequest) =>
    readSheetHiddenStateThroughWorker(state, request)
  const hideRows = (request: HideRowsRequest) => hideRowsThroughWorker(state, request)
  const unhideRows = (request: UnhideRowsRequest) => unhideRowsThroughWorker(state, request)
  const setEvalHiddenRows = (request: SetEvalHiddenRowsRequest) =>
    setEvalHiddenRowsThroughWorker(state, request)

  return {
    /**
     * Read-back of the engine-owned hidden state (design §4.2), so ui-core can
     * hydrate its render caches on sheet activation / restore. Combines
     * `listHiddenRows` (manual) and `getFilter` (rules + derived filter rows) in
     * one whole-sheet answer. Capability-gated by `engineHiddenState` — the TS
     * runtime omits it and ui-core keeps its own canonical view fact.
     */
    get readSheetHiddenState() {
      return runtimeSupports(state, 'engineHiddenState') ? readSheetHiddenState : undefined
    },

    /**
     * Engine-owned manual hidden rows (design-engine-hidden-rows E2/E5).
     * Incremental ACK ports — the "zero push" endgame (followup P1). Once
     * both backends expose these, UI-core feeds the manual set through
     * `hideRows`/`unhideRows` and the `setEvalHiddenRows` whole-set push
     * degrades to a fallback path. Capability-gated by `engineHiddenState`
     * (same witness as `readSheetHiddenState` / `setFilterSort`).
     */
    get hideRows() {
      return runtimeSupports(state, 'engineHiddenState') ? hideRows : undefined
    },

    get unhideRows() {
      return runtimeSupports(state, 'engineHiddenState') ? unhideRows : undefined
    },

    /**
     * Engine hidden-row eval input (parity #23). Capability-gated by
     * `evalHiddenRows`: the TS worker declares it `false` so this port
     * reads `undefined` and the provider silently skips the push (SUBTOTAL
     * 101-111 degrades to "does not exclude"); the WASM runtime's null
     * witness keeps it exposed (full trust). See
     * `setEvalHiddenRowsThroughWorker` for the whole-set-replace semantics.
     */
    get setEvalHiddenRows() {
      return runtimeSupports(state, 'evalHiddenRows') ? setEvalHiddenRows : undefined
    },
  }
}
