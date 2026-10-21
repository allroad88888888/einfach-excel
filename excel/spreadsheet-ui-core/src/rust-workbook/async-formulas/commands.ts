import type { WorkerCommand } from '../../rust-worker/types'
import type { AsyncFormulaError, JsonFormulaValue } from './fetch-json'

export interface PendingAsyncFormulaCall {
  readonly callId: number
  readonly name: string
  readonly args: readonly unknown[]
}

export interface WasmAsyncFormulaQueries {
  read_custom_formulas?: () => string
  registerCustomFormulaAsync?: (name: string) => void
  drainAsyncCustomRequests?: () => readonly PendingAsyncFormulaCall[]
  resolveAsyncCustomCall?: (
    callId: number, value: { readonly json: JsonFormulaValue } | AsyncFormulaError
  ) => boolean
}

export interface RustAsyncFormulaCommands {
  /** A single deferred RPC, completed by actual I/O settlement rather than a polling timer. */
  'formula.awaitAsync': WorkerCommand<Record<string, never>, { readonly settled: boolean }>
}
