import { createAsyncCustomPump, type AsyncCustomArg } from './async-custom-pump'
import type { WasmWorkbookRuntime } from './wasm-workbook-surface'
import type { WorkerCommandHandler } from './worker-command'
import { currentWorkbook } from './worker-workbook-host'
import { postDirty, postResponse } from './worker-post'

/**
 * Wave 8 — compiled custom formulas live in the worker thread. The
 * source string travels across `postMessage` (closures cannot) and is
 * `new Function('args', source)`-d here. The compiled callable is then
 * handed to the WASM Workbook via `register_custom_formula` when that
 * bridge is available; if the bridge is missing we still remember the
 * compiled fn so a re-registration cycle is a clean replace.
 */
type CustomFormulaCallable = (args: AsyncCustomArg[]) => unknown

const customFormulas = new Map<string, { fn: CustomFormulaCallable; isAsync: boolean }>()

export function clearCustomFormulas() {
  customFormulas.clear()
}

/**
 * Wave 8.2 — async custom-formula pump over the WASM engine. Drains the
 * engine's pending-call queue after every command, invokes the local
 * compiled callback, awaits it, and settles via resolveAsyncCustomCall.
 * Settle writes propagate through the Store, so subscribed cells emit
 * dirty events through the normal subscribe_cell → postDirty path — no
 * extra wire event. Engine identity (`currentEngine`) drops in-flight
 * settles across initWorkbook/reset.
 */
export const asyncCustomPump = createAsyncCustomPump<WasmWorkbookRuntime>({
  currentEngine: () => currentWorkbook(),
  drain: (engine) => engine.drainAsyncCustomRequests?.() ?? [],
  resolve: (engine, callId, value) => {
    const settled = engine.resolveAsyncCustomCall?.(callId, value) ?? false
    // A settle lands OUTSIDE any command frame, so the host has no
    // response to piggyback a refresh on. Cell subscriptions cover
    // precisely-subscribed cells; this coarse ping (no addresses — the
    // wasm drain does not expose observer cells) tells the backend to
    // refetch the visible projection.
    if (settled) postDirty([])
    return settled
  },
  lookup: (name) => {
    const entry = customFormulas.get(name)
    return entry?.isAsync ? entry.fn : undefined
  },
  // eslint-disable-next-line no-console -- worker devtools diagnostic is established contract
  warn: console.warn,
})

const CUSTOM_FORMULA_NAME_REGEX = /^[A-Z][A-Z0-9_.]*$/

function assertCustomFormulaName(name: unknown): string {
  if (typeof name !== 'string' || name.length === 0) {
    throw Object.assign(new Error('custom formula name must be a non-empty string'), {
      code: 'INVALID_CUSTOM_FORMULA_NAME',
    })
  }
  if (!CUSTOM_FORMULA_NAME_REGEX.test(name)) {
    throw Object.assign(new Error(`invalid custom formula name: ${name}`), {
      code: 'INVALID_CUSTOM_FORMULA_NAME',
    })
  }
  return name
}

const AsyncFunctionCtor = Object.getPrototypeOf(async function () {
  /* async constructor probe */
}).constructor as new (arg: string, body: string) => CustomFormulaCallable

function compileCustomFormula(
  name: string,
  source: unknown,
  isAsync: boolean,
): CustomFormulaCallable {
  if (typeof source !== 'string') {
    throw Object.assign(new Error(`custom formula ${name}: source must be a string`), {
      code: 'INVALID_CUSTOM_FORMULA_SOURCE',
    })
  }
  try {
    // SECURITY: `new Function` runs in the worker's global scope, NOT
    // the surrounding lexical scope. That sandboxes the body away from
    // *this module's* closure variables, but it does NOT sandbox it
    // away from worker-global authority — the compiled function has
    // full access to `self`, `postMessage`, `fetch`, `indexedDB`, any
    // imported scripts, the WASM workbook handle, etc. This is
    // therefore ONLY safe for HOST-TRUSTED source (developer code
    // shipped with the app, configuration loaded from a trusted
    // backend). Untrusted user-input source MUST go through a separate
    // iframe-sandbox + structured-clone IPC boundary instead. See
    // `excel/rust/excel-core/src/CUSTOM_FORMULAS.md` § "Security model" for
    // the full trust contract. Async bodies compile through the
    // AsyncFunction constructor (same trust model) so they can `await`.
    const fn = isAsync
      ? new AsyncFunctionCtor('args', source)
      : (new Function('args', source) as CustomFormulaCallable)
    return fn
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw Object.assign(
      new Error(`custom formula ${name}: failed to compile source — ${reason}`),
      { code: 'INVALID_CUSTOM_FORMULA_SOURCE' },
    )
  }
}

function registerCustomFormulaInWorker(
  wb: WasmWorkbookRuntime,
  name: string,
  source: unknown,
  isAsync: boolean,
): boolean {
  const validatedName = assertCustomFormulaName(name)
  const fn = compileCustomFormula(validatedName, source, isAsync)
  if (isAsync && !wb.registerCustomFormulaAsync) {
    // Engine bridge predates async support. Refuse loudly instead of
    // silently registering a sync callback that returns a Promise
    // (which the engine would marshal to #TYPE! per cell).
    throw Object.assign(
      new Error(`custom formula ${validatedName}: async registration requires a newer wasm build`),
      { code: 'ASYNC_CUSTOM_FORMULA_UNSUPPORTED' },
    )
  }
  customFormulas.set(validatedName, { fn, isAsync })
  if (isAsync) {
    wb.registerCustomFormulaAsync!(validatedName)
    return true
  }
  if (wb.registerCustomFormula) {
    wb.registerCustomFormula(validatedName, fn)
    return true
  }
  // Bridge not yet available — remember the source so a later
  // unregister/re-register works, and signal back `false` so the
  // adapter can flag this state if it cares. We do NOT throw because
  // an absent bridge is the expected condition before agent A lands
  // the WASM side.
  return false
}

function unregisterCustomFormulaInWorker(wb: WasmWorkbookRuntime, name: unknown): boolean {
  if (typeof name !== 'string' || name.length === 0) return false
  const hadLocal = customFormulas.delete(name)
  if (wb.unregisterCustomFormula) {
    return wb.unregisterCustomFormula(name)
  }
  return hadLocal
}

/** 注册/注销这两条命令的 RPC 入口 —— 编译后的回调归本模块所有。 */
export const handleCustomFormulaCommand: WorkerCommandHandler = (id, msg, wb) => {
  switch (msg.cmd) {
    case 'registerCustomFormula':
      postResponse(
        id,
        registerCustomFormulaInWorker(wb, msg.name as string, msg.source, msg.isAsync === true),
      )
      return true
    case 'unregisterCustomFormula':
      postResponse(id, unregisterCustomFormulaInWorker(wb, msg.name))
      return true
    default:
      return false
  }
}
