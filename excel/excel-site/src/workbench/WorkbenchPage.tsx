/**
 * The flagship `/workbench` page: full Excel-style chrome (menu bar, toolbar,
 * formula bar, sheet tabs, status bar, format painter — everything on) over a
 * real 3-sheet growth model (Overview -> Forecast -> Assumptions) running on
 * the Rust/WASM worker engine. A right rail carries the guided tour
 * (`WorkbenchTour`, owned by `./tour/TourController`) on top of the
 * library's history timeline. `workbench-seed.ts`'s `WB` coordinate table is
 * the source of truth for any copy here that cites a cell/formula.
 */
import { For, Show, createEffect, onCleanup } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import { selectCellAtom, selectionAtom, workspaceSessionAtom } from '@einfach/spreadsheet-ui-core'
import type { ViewportMetrics } from '@einfach/spreadsheet-ui-core'
import {
  SpreadsheetGrid,
  SpreadsheetHistoryTimeline,
  useSpreadsheetUiStore,
} from '@einfach/solid-excel/vnext'
import SpreadsheetChrome from '../spreadsheet/SpreadsheetChrome'
import { makeWasmWorkerBackend } from '../spreadsheet/backends'
import { useLocale } from '../i18n/use-site-t'
import WorkbenchTour from './tour/TourController'
import { seedWorkbenchWorkbook, workbenchSheets } from './workbench-seed'
import './workbench.css'

// Generous viewport — the Overview table only spans A1:J14, so this leaves
// plenty of room to scroll/explore beyond it, same spirit as the other
// worker-backed demos' viewports but sized up for a flagship page.
const viewport: ViewportMetrics = {
  scrollTop: 0,
  scrollLeft: 0,
  viewportHeight: 560,
  viewportWidth: 900,
  rowHeight: 24,
  colWidth: 110,
  rowCount: 60,
  colCount: 26,
  overscanRows: 4,
  overscanCols: 4,
}

const copy = {
  en: {
    title: 'The Workbench',
    subtitle:
      'A real 3-sheet growth model on the Rust/WASM engine — Forecast!B4 is =Overview!G14, ' +
      'a genuine cross-sheet reference, not a canned demo.',
    badges: ['Rust/WASM engine', 'real cross-sheet formulas', 'full chrome'],
  },
  zh: {
    title: '工作台',
    subtitle:
      '一个跑在 Rust/WASM 引擎上的真实三表增长模型 —— Forecast!B4 就是 =Overview!G14，' +
      '一条真正的跨表引用，不是摆拍演示。',
    badges: ['Rust/WASM 引擎', '真实跨表公式', '完整工具链'],
  },
} as const

/**
 * Mirrors `FormulasGrid`/`HistoryGrid`: lives in its own component so it can
 * call `useSpreadsheetUiStore`/`useAtomValue`, which only resolve once
 * mounted inside `SpreadsheetChrome`'s provider (reached via `children`).
 * Defaults the cursor to A1 on whichever sheet resolves first from
 * `backend.listSheets()`; `workbenchSheets` puts Overview
 * (`WB.sumFormulaCell.sheetId`) first, so that is where this lands. Kept
 * deliberately simple — `WorkbenchTour` drives selection from there.
 */
function WorkbenchGrid() {
  const store = useSpreadsheetUiStore()
  const workspace = useAtomValue(workspaceSessionAtom)
  const activeSheetId = () => workspace().activeSheetId

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

export default function WorkbenchPage() {
  const locale = useLocale()

  // Live-worker lifecycle, same as `FormulasDemo`: a fresh Worker + WASM
  // instance per mount, disposed on unmount. Every backend method awaits its
  // own `ready()` handshake internally, so mounting `SpreadsheetChrome`
  // immediately (no separate ready-gate) is the working pattern.
  const backend = makeWasmWorkerBackend({
    sheets: workbenchSheets,
    afterInit: seedWorkbenchWorkbook,
  })

  onCleanup(() => backend.dispose())

  return (
    <section class="site-workbench-page">
      <header class="site-workbench-header">
        <div class="site-workbench-heading-row">
          <h1 class="site-workbench-title">{copy[locale()].title}</h1>
          <ul class="site-workbench-badges">
            <For each={copy[locale()].badges}>
              {(badge) => <li class="site-workbench-badge">{badge}</li>}
            </For>
          </ul>
        </div>
        <p class="site-workbench-subtitle">{copy[locale()].subtitle}</p>
      </header>

      <div class="site-workbench-surface">
        <SpreadsheetChrome backend={backend} chrome={{ menuBar: true, formatPainter: true }}>
          <div class="vnext-demo-body site-workbench-body">
            <div class="vnext-demo-main">
              <WorkbenchGrid />
            </div>
            <aside class="vnext-demo-sidebar site-workbench-rail">
              <WorkbenchTour />
              <SpreadsheetHistoryTimeline />
            </aside>
          </div>
        </SpreadsheetChrome>
      </div>
    </section>
  )
}
