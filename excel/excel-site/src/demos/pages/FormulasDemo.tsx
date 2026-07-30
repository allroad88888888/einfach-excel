/**
 * The "formulas" demo: full chrome over a 3-sheet forecast model backed by
 * the Rust/WASM workbook engine through a Web Worker — Inputs -> Model ->
 * Summary, so editing an Inputs cell recalculates Summary across two sheet
 * hops. This is the vanguard proof that worker bundling survives the
 * pnpm-linked package boundary: if this page's production build emits a
 * worker chunk that resolves the real WASM module, the boundary works.
 */
import { For, Show, createEffect, onCleanup } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import { selectCellAtom, selectionAtom, workspaceSessionAtom } from '@einfach/spreadsheet-ui-core'
import type { ViewportMetrics } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetGrid, useSpreadsheetUiStore } from '@einfach/solid-excel/vnext'
import SpreadsheetChrome from '../../spreadsheet/SpreadsheetChrome'
import { makeWasmWorkerBackend } from '../../spreadsheet/backends'
import { useLocale, useSiteT } from '../../i18n/use-site-t'
import { formulasSheets, seedFormulasWorkbook } from '../seeds/seed-formulas'

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

const copy = {
  en: {
    tips: [
      'Edit a number on the Inputs sheet, then switch to Summary — the totals recalc across two sheet hops.',
      'Click a formula cell (e.g. Model!B3) — the formula bar shows its source, not just the result.',
      'Switch sheets with the tabs below the grid; Model and Summary both read live from Inputs.',
    ],
  },
  zh: {
    tips: [
      '修改 Inputs 表中的一个数字，再切到 Summary —— 总计会跨两级工作表联动重算。',
      '点击任意公式单元格（例如 Model!B3）—— 编辑栏会显示公式本身，而不只是结果。',
      '用网格下方的标签页切换工作表；Model 与 Summary 都实时读取 Inputs 的数据。',
    ],
  },
} as const

/**
 * Mirrors `BasicsGrid` (`BasicsDemo.tsx`): lives in its own component so it
 * can call `useSpreadsheetUiStore`/`useAtomValue`, which only resolve once
 * mounted inside `SpreadsheetChrome`'s `SpreadsheetUiProvider` (reached via
 * the `children` prop).
 */
function FormulasGrid() {
  const store = useSpreadsheetUiStore()
  const workspace = useAtomValue(workspaceSessionAtom)
  const activeSheetId = () => workspace().activeSheetId

  // Same convention as `BasicsGrid`: `SpreadsheetChrome` mounts
  // `SpreadsheetSheetTabs` with an empty seed list and resolves the real
  // active sheet asynchronously from `backend.listSheets()`. Once it lands,
  // default the cursor to A1 if nothing has selected a cell yet.
  createEffect(() => {
    const sheetId = activeSheetId()
    if (!sheetId) return
    if (store.getter(selectionAtom).sheetId) return
    store.setter(selectCellAtom, { sheetId, coord: { row: 0, col: 0 } })
  })

  return (
    <Show keyed when={activeSheetId()}>
      {(sheetId) => <SpreadsheetGrid sheetId={sheetId} viewport={viewport} />}
    </Show>
  )
}

export default function FormulasDemo() {
  const t = useSiteT()
  const locale = useLocale()

  // Unlike the static-backend demos (module-level `backend`), this backend
  // owns a live Worker + WASM instance, so it is built fresh per mount and
  // disposed on unmount — the same lifecycle `VNextWorkerDemo.tsx` uses.
  // Every backend method (including the ones `SpreadsheetChrome`'s provider
  // calls on first render) internally awaits its own `ready()` handshake
  // before touching the workbook, so there is no separate ready-gate to
  // wire here: mounting `SpreadsheetChrome` immediately is the working
  // pattern, not a shortcut.
  const backend = makeWasmWorkerBackend({
    sheets: formulasSheets,
    afterInit: seedFormulasWorkbook,
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
        <FormulasGrid />
      </SpreadsheetChrome>
    </div>
  )
}
