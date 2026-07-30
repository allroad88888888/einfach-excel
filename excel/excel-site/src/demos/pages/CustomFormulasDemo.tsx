/**
 * The "custom formulas" demo: registers MYTAX/GREET/CELSIUS the exact way
 * `VNextWave5Demo` does, plus one async formula (SLOWSQR), over a small
 * prices/names/temperatures sheet.
 *
 * Backed by the worker-wasm backend (`registry.ts` pins
 * `backend: 'worker-wasm'` for this demo id — flipped from an earlier
 * `'static'` draft once it turned out the static backend's formula
 * evaluator is a wholly separate hand-rolled JS parser that never learns
 * ANY custom-formula name, sync or async). `worker-workbook-backend.ts`
 * (lines ~5340-5351) DOES implement `registerCustomFormula` /
 * `unregisterCustomFormula`, forwarding to the worker's
 * `client.registerCustomFormula`, and the shared pump in
 * `adapter/async-custom-pump.ts` drains/settles async calls after every
 * worker command (`worker-runtime.ts`'s dispatch loop calls
 * `asyncCustomPump.pump()` in a `finally`), so both sync and async custom
 * formulas are real here.
 *
 * Registration ordering, read from `SpreadsheetUiProvider.tsx` and
 * `worker-workbook-backend.ts`:
 * - The provider subscribes to `customFormulaRegistryAtom` and primes a
 *   reconcile pass synchronously at Provider setup, before any child
 *   (including `CustomFormulasGrid` below) mounts — so registrations
 *   written from `onMount` are never missed.
 * - The backend's `registerCustomFormula` port does `await readyPromise`
 *   before calling `client.registerCustomFormula`, and that same
 *   `readyPromise` is what `afterInit` (this page's seed, which writes
 *   `=MYTAX(B2)` etc.) resolves through. So registration is CAUSALLY
 *   AFTER seeding, not before: the seed formulas are briefly unresolved
 *   (`#NAME?`) until MYTAX/GREET/CELSIUS/SLOWSQR land. That self-corrects
 *   without any extra code — registering a custom name calls the engine's
 *   `invalidate_all_formulas_for_custom_function_change`, which
 *   re-evaluates every formula that consulted the custom registry, and
 *   the worker's `postDirty` on that recompute is the same path a live
 *   cell edit uses to refresh the UI. No manual re-seed or re-read needed.
 * - SLOWSQR's first evaluation (part of that same invalidation recompute)
 *   is the memo's first hit, so it goes `#NAME?` -> `#BUSY!` -> (~800ms
 *   later) `400`, settled by the pump and pushed the same way.
 */
import { For, Show, createEffect, onCleanup, onMount } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import {
  registerCustomFormulaAtom,
  selectCellAtom,
  selectionAtom,
  unregisterCustomFormulaAtom,
  workspaceSessionAtom,
} from '@einfach/spreadsheet-ui-core'
import type { ViewportMetrics } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetGrid, useSpreadsheetUiStore } from '@einfach/solid-excel/vnext'
import SpreadsheetChrome from '../../spreadsheet/SpreadsheetChrome'
import { makeWasmWorkerBackend } from '../../spreadsheet/backends'
import { useLocale, useSiteT } from '../../i18n/use-site-t'
import { customFormulasSheets, seedCustomFormulasWorkbook } from '../seeds/seed-custom-formulas'

const viewport: ViewportMetrics = {
  scrollTop: 0,
  scrollLeft: 0,
  viewportHeight: 380,
  viewportWidth: 720,
  rowHeight: 24,
  colWidth: 130,
  rowCount: 100,
  colCount: 20,
  overscanRows: 2,
  overscanCols: 2,
}

// Wave 8 registration — same three sync formulas, same shape, as
// `VNextWave5Demo.tsx`'s `seeded` array, plus one Wave 8.2 async formula.
// Not `as const`: `paramLabels` needs to stay a mutable `string[]` to
// match `CustomFormulaRegistration`.
const REGISTERED_FORMULAS = [
  {
    name: 'MYTAX',
    source: 'return Number(args[0]) * 0.2',
    description: '20% tax on the input amount',
    paramLabels: ['amount'],
  },
  {
    name: 'GREET',
    source: "return 'Hello, ' + String(args[0] ?? '')",
    description: 'Friendly greeting',
    paramLabels: ['name'],
  },
  {
    name: 'CELSIUS',
    source: 'return (Number(args[0]) - 32) * 5 / 9',
    description: 'Convert Fahrenheit to Celsius',
    paramLabels: ['fahrenheit'],
  },
  {
    name: 'SLOWSQR',
    source:
      'await new Promise((resolve) => setTimeout(resolve, 800)); ' +
      'const n = Number(args[0]); return n * n',
    description: 'Square the input after an ~800ms artificial delay',
    paramLabels: ['n'],
    isAsync: true,
  },
]

const copy = {
  en: {
    tips: [
      'B10 calls =SLOWSQR(B2), an async custom formula — watch it settle from #BUSY! to 400 a moment after the page loads.',
      'Edit B2 (the price) and every custom-formula cell that reads it recalculates: B8 (tax) updates immediately, B10 re-settles through another #BUSY! round trip.',
      'Type =GREET("world") into an empty cell — a custom formula can take a literal argument, not just a cell reference.',
    ],
  },
  zh: {
    tips: [
      'B10 调用 =SLOWSQR(B2)，这是一个异步自定义公式——页面加载后不久，它会从 #BUSY! 变为 400。',
      '修改 B2（价格），所有引用它的自定义公式都会重算：B8（税额）立即更新，B10 则会再经历一轮 #BUSY! 才结算出新值。',
      '在空白单元格里输入 =GREET("world")——自定义公式既能接收单元格引用，也能接收字面量参数。',
    ],
  },
} as const

/**
 * Mirrors `FormulasGrid` (`FormulasDemo.tsx`): lives in its own component
 * so it can call `useSpreadsheetUiStore`/`useAtomValue`, which only
 * resolve once mounted inside `SpreadsheetChrome`'s `SpreadsheetUiProvider`
 * (reached via the `children` prop).
 */
function CustomFormulasGrid() {
  const store = useSpreadsheetUiStore()
  const workspace = useAtomValue(workspaceSessionAtom)
  const activeSheetId = () => workspace().activeSheetId

  createEffect(() => {
    const sheetId = activeSheetId()
    if (!sheetId) return
    if (store.getter(selectionAtom).sheetId) return
    store.setter(selectCellAtom, { sheetId, coord: { row: 0, col: 0 } })
  })

  // Same registration/teardown shape as `VNextWave5Demo.tsx`'s Wave 8
  // effect: register on mount, unregister on cleanup so a hot-reload does
  // not double-register.
  onMount(() => {
    for (const reg of REGISTERED_FORMULAS) store.setter(registerCustomFormulaAtom, reg)
    onCleanup(() => {
      for (const reg of REGISTERED_FORMULAS) store.setter(unregisterCustomFormulaAtom, reg.name)
    })
  })

  return (
    <Show keyed when={activeSheetId()}>
      {(sheetId) => <SpreadsheetGrid sheetId={sheetId} viewport={viewport} />}
    </Show>
  )
}

export default function CustomFormulasDemo() {
  const t = useSiteT()
  const locale = useLocale()

  // Same lifecycle as `FormulasDemo.tsx`: a live Worker + WASM instance,
  // built fresh per mount and disposed on unmount. Every backend method
  // (including `registerCustomFormula`, called from `CustomFormulasGrid`)
  // internally awaits its own `ready()` handshake before touching the
  // workbook, so mounting `SpreadsheetChrome` immediately is the working
  // pattern — no separate ready-gate to wire here.
  const backend = makeWasmWorkerBackend({
    sheets: customFormulasSheets,
    afterInit: seedCustomFormulasWorkbook,
  })

  onCleanup(() => backend.dispose())

  return (
    <div class="site-demo-basics">
      <aside class="site-demo-tips">
        <h2 class="site-demo-tips-heading">{t('site.demo.tryThis')}</h2>
        <ul class="site-demo-tips-list">
          <For each={copy[locale()].tips}>{(tip) => <li>{tip}</li>}</For>
        </ul>
      </aside>
      <SpreadsheetChrome backend={backend}>
        <CustomFormulasGrid />
      </SpreadsheetChrome>
    </div>
  )
}
