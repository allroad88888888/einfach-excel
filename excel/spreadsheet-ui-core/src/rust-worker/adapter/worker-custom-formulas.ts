import {
  createAsyncCustomPump,
  type AsyncCustomArg,
  type AsyncCustomPump,
} from './async-custom-pump'
import type { WasmWorkbookRuntime } from './wasm-workbook-surface'
import type { WorkerCommandHandler } from './worker-command'
import { postDirty, postResponse } from './worker-post'

/** A compiled formula map and async pump owned by one workbook runtime. */
export type WorkerCustomFormulaRuntime = {
  clear(): void
  readonly asyncCustomPump: AsyncCustomPump
  readonly handleCommand: WorkerCommandHandler
}

type CustomFormulaCallable = (args: AsyncCustomArg[]) => unknown

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
    // SECURITY: source runs in the worker global scope. It is only safe for
    // host-trusted developer code, never for untrusted user input.
    return isAsync
      ? new AsyncFunctionCtor('args', source)
      : (new Function('args', source) as CustomFormulaCallable)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw Object.assign(new Error(`custom formula ${name}: failed to compile source — ${reason}`), {
      code: 'INVALID_CUSTOM_FORMULA_SOURCE',
    })
  }
}

export function createWorkerCustomFormulaRuntime(
  currentWorkbook: () => WasmWorkbookRuntime | undefined,
): WorkerCustomFormulaRuntime {
  const customFormulas = new Map<string, { fn: CustomFormulaCallable; isAsync: boolean }>()

  function register(
    wb: WasmWorkbookRuntime,
    name: string,
    source: unknown,
    isAsync: boolean,
  ): boolean {
    const validatedName = assertCustomFormulaName(name)
    const fn = compileCustomFormula(validatedName, source, isAsync)
    if (isAsync && !wb.registerCustomFormulaAsync) {
      throw Object.assign(
        new Error(
          `custom formula ${validatedName}: async registration requires a newer wasm build`,
        ),
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
    return false
  }

  function unregister(wb: WasmWorkbookRuntime, name: unknown): boolean {
    if (typeof name !== 'string' || name.length === 0) return false
    const hadLocal = customFormulas.delete(name)
    return wb.unregisterCustomFormula ? wb.unregisterCustomFormula(name) : hadLocal
  }

  const asyncCustomPump = createAsyncCustomPump<WasmWorkbookRuntime>({
    currentEngine: currentWorkbook,
    drain: (engine) => engine.drainAsyncCustomRequests?.() ?? [],
    resolve: (engine, callId, value) => {
      const settled = engine.resolveAsyncCustomCall?.(callId, value) ?? false
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

  const handleCommand: WorkerCommandHandler = (id, msg, wb) => {
    switch (msg.cmd) {
      case 'registerCustomFormula':
        postResponse(id, register(wb, msg.name as string, msg.source, msg.isAsync === true))
        return true
      case 'unregisterCustomFormula':
        postResponse(id, unregister(wb, msg.name))
        return true
      default:
        return false
    }
  }

  return {
    clear: () => customFormulas.clear(),
    asyncCustomPump,
    handleCommand,
  }
}
