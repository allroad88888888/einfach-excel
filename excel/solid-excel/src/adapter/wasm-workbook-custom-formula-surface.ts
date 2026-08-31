import type { AsyncCustomRequest } from './async-custom-pump'

/** Optional custom-formula bindings supplied by newer wasm builds. */
export type WasmWorkbookCustomFormulaRuntime = {
  /**
   * Wave 8 — register a synchronous JS callback as a user-defined formula.
   * The Rust side calls back into JS with a plain array of values.
   */
  registerCustomFormula?: (
    name: string,
    fn: (args: Array<number | string | boolean | null>) => unknown,
  ) => void
  unregisterCustomFormula?: (name: string) => boolean
  /**
   * Wave 8.2 — async registration is name-only; callbacks remain in the
   * worker and the engine queues requests for the pump to resolve.
   */
  registerCustomFormulaAsync?: (name: string) => void
  drainAsyncCustomRequests?: () => AsyncCustomRequest[]
  resolveAsyncCustomCall?: (callId: number, value: unknown) => boolean
}
