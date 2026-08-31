import { formatA1, type ErrorCode, type Value, type Workbook } from '@einfach/excel-core-ts'

import {
  createAsyncCustomPump,
  type AsyncCustomArg,
  type AsyncCustomCallable,
  type AsyncCustomPump,
} from '../async-custom-pump'
import { gateCustomArrayReturn } from '../custom-array-return'
import type { CellRefWire } from '../worker-protocol'
import { rpcError } from './runtime-errors'
import type { RuntimeState } from './runtime-state'

const CUSTOM_FORMULA_ERROR_CODES: readonly ErrorCode[] = [
  '#NULL!',
  '#DIV/0!',
  '#N/A',
  '#REF!',
  '#VALUE!',
  '#NAME?',
  '#NUM!',
  '#CYCLE!',
  '#TYPE!',
  '#ARGS!',
  '#SPILL!',
  '#CALC!',
]

const AsyncFunctionCtor = Object.getPrototypeOf(async function () {
  /* async constructor probe */
}).constructor as new (arg: string, body: string) => AsyncCustomCallable

export function unwrapCustomValue(value: Value): unknown {
  switch (value.kind) {
    case 'blank':
      return null
    case 'number':
    case 'string':
    case 'boolean':
      return value.value
    case 'error':
      return value.code
    case 'array':
      return value.value.map((row) => row.map(unwrapCustomValue))
  }
}

export function wrapCustomResult(result: unknown): Value {
  if (result === null || result === undefined) return { kind: 'blank' }
  if (typeof result === 'number') return { kind: 'number', value: result }
  if (typeof result === 'boolean') return { kind: 'boolean', value: result }
  if (typeof result === 'string') {
    if (result === '#BUSY!') return { kind: 'error', code: '#VALUE!' }
    const match = CUSTOM_FORMULA_ERROR_CODES.find((code) => code === result)
    if (match !== undefined) return { kind: 'error', code: match }
    return { kind: 'string', value: result }
  }
  if (Array.isArray(result)) {
    const gated = gateCustomArrayReturn(result)
    if (!gated.ok) return { kind: 'error', code: gated.code, message: gated.message }
    return { kind: 'array', value: gated.rows.map((row) => row.map(wrapCustomResult)) }
  }
  if (typeof result === 'object' && 'error' in (result as Record<string, unknown>)) {
    const token = (result as { error: unknown }).error
    if (typeof token === 'string' && token !== '#BUSY!') {
      const match = CUSTOM_FORMULA_ERROR_CODES.find((code) => code === token)
      if (match !== undefined) return { kind: 'error', code: match }
    }
    return { kind: 'error', code: '#VALUE!' }
  }
  return { kind: 'string', value: String(result) }
}

export function registerCustomFormulaInWorker(
  state: RuntimeState,
  name: string,
  source: string,
  isAsync: boolean,
): boolean {
  if (typeof name !== 'string' || name.length === 0) {
    throw rpcError('INVALID_CUSTOM_FORMULA_NAME', 'custom formula name must be a non-empty string')
  }
  if (typeof source !== 'string') {
    throw rpcError('INVALID_CUSTOM_FORMULA_SOURCE', 'custom formula source must be a string')
  }
  if (isAsync) {
    const callable = new AsyncFunctionCtor('args', source)
    state.customFormulas.set(name.toUpperCase(), { source, isAsync: true, callable })
    state.workbook.registerCustomFormula(
      name,
      () => {
        throw new Error(`async custom formula ${name} must not be invoked by the engine`)
      },
      { isAsync: true },
    )
    return true
  }
  // eslint-disable-next-line no-new-func
  const compiled = new Function('args', source) as (args: unknown[]) => unknown
  state.customFormulas.set(name.toUpperCase(), { source, isAsync: false })
  state.workbook.registerCustomFormula(name, (args: Value[]) => {
    try {
      return wrapCustomResult(compiled(args.map(unwrapCustomValue)))
    } catch (err) {
      return {
        kind: 'error',
        code: '#VALUE!',
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })
  return true
}

export function unregisterCustomFormulaInWorker(state: RuntimeState, name: unknown): boolean {
  if (typeof name !== 'string') return false
  state.customFormulas.delete(name.toUpperCase())
  return state.workbook.unregisterCustomFormula(name)
}

export function rebindCustomFormulas(state: RuntimeState): void {
  for (const [name, entry] of state.customFormulas) {
    try {
      registerCustomFormulaInWorker(state, name, entry.source, entry.isAsync)
    } catch {
      // Rebinding remains best-effort across workbook replacement.
    }
  }
}

export function createCustomFormulaPump(
  getState: () => RuntimeState,
  postDirty?: (cells: CellRefWire[]) => void,
): AsyncCustomPump {
  return createAsyncCustomPump<Workbook>({
    currentEngine: () => getState().workbook,
    drain: (engine) =>
      engine.drainPendingAsyncCustomCalls().map((call) => ({
        callId: call.callId,
        name: call.name,
        args: call.args.map(unwrapCustomValue) as AsyncCustomArg[],
      })),
    resolve: (engine, callId, value) => {
      const state = getState()
      const outcome = engine.resolveAsyncCustomCall(callId, wrapCustomResult(value))
      if (outcome.resolved && outcome.touched.length > 0 && postDirty) {
        const cells: CellRefWire[] = []
        for (const { sheetId, key } of outcome.touched) {
          const sheet = state.sheets.find((entry) => entry.id === sheetId)
          if (!sheet) continue
          const [rowStr, colStr] = key.split(':')
          cells.push({
            sheet: sheet.idx,
            addr: formatA1({ row: Number(rowStr), col: Number(colStr) }),
          })
        }
        if (cells.length > 0) postDirty(cells)
      }
      return outcome.resolved
    },
    lookup: (name) => {
      const entry = getState().customFormulas.get(name.toUpperCase())
      return entry?.isAsync ? entry.callable : undefined
    },
    // eslint-disable-next-line no-console -- worker devtools diagnostic is established contract
    warn: console.warn,
  })
}
