// 一句话：自定义公式注册端口。

import type { WorkerWorkbookSpreadsheetBackend } from '../types'
import type { WorkerBackendState } from '../state'

export function createCustomFormulaPorts(
  state: WorkerBackendState,
): Pick<WorkerWorkbookSpreadsheetBackend, 'registerCustomFormula' | 'unregisterCustomFormula'> {
  return {
    /**
     * Wave 8 custom-formulas port. The Solid host subscribes to
     * `customFormulaRegistryAtom` and forwards add/remove edges here;
     * the worker compiles the source via `new Function('args', source)`
     * and registers the resulting callable with the WASM Workbook (or
     * stubs gracefully when the WASM bridge is missing).
     *
     * NOT undoable, NOT history-tracked, NOT revision-bumping — the
     * registry is a workbook-wide capability registration, not a cell
     * mutation, so a re-evaluation cascade happens on the WASM side
     * when registered names appear inside existing formulas. No
     * `affectedRange` exists.
     */
    async registerCustomFormula(
      name: string,
      source: string,
      registration?: { isAsync?: boolean },
    ): Promise<void> {
      await state.readyPromise
      await state.client.registerCustomFormula(name, source, registration)
    },

    async unregisterCustomFormula(name: string): Promise<void> {
      await state.readyPromise
      await state.client.unregisterCustomFormula(name)
    },
  }
}
