/**
 * The "performance" demo: a 50,000-row × 8-column generated dataset
 * (400,000 data cells, plus a small header/summary block) loaded through
 * the Rust/WASM workbook engine over a Web Worker, using the worker's
 * chunked import-session API — never per-cell `setCell` calls. See
 * `seed-performance.ts` for the import mechanics and why `direct` import
 * mode (not `atomic`) is what makes this scale reachable.
 *
 * The grid only ever projects the visible viewport window (plus a small
 * overscan margin) — scrolling through 50,000 rows never asks the worker
 * for more than a few dozen rows at a time.
 */
import { For, Show, createEffect, onCleanup } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import { selectCellAtom, selectionAtom, workspaceSessionAtom } from '@einfach/spreadsheet-ui-core'
import type { ViewportMetrics } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetGrid, useSpreadsheetUiStore } from '@einfach/solid-excel/vnext'
import SpreadsheetChrome from '../../spreadsheet/SpreadsheetChrome'
import { makeWasmWorkerBackend } from '../../spreadsheet/backends'
import { useLocale, useSiteT } from '../../i18n/use-site-t'
import {
  PERFORMANCE_COLS,
  PERFORMANCE_DATA_ROWS,
  PERFORMANCE_SHEET_ROWS,
  performanceSheets,
  seedPerformanceWorkbook,
} from '../seeds/seed-performance'

const viewport: ViewportMetrics = {
  scrollTop: 0,
  scrollLeft: 0,
  viewportHeight: 380,
  viewportWidth: 720,
  rowHeight: 24,
  colWidth: 130,
  rowCount: PERFORMANCE_SHEET_ROWS,
  colCount: PERFORMANCE_COLS,
  overscanRows: 4,
  overscanCols: 2,
}

const rowsLabel = PERFORMANCE_DATA_ROWS.toLocaleString('en-US')
const cellsLabel = (PERFORMANCE_DATA_ROWS * PERFORMANCE_COLS).toLocaleString('en-US')

const copy = {
  en: {
    stats: `Dataset: ${rowsLabel} rows × ${PERFORMANCE_COLS} columns (${cellsLabel} cells), seeded through the worker's chunked import API.`,
    tips: [
      'Scroll the grid — only the visible window (plus a small overscan margin) is ever projected from the worker; the other rows stay untouched.',
      'Use the name box above the grid to jump straight to a cell deep in the sheet, e.g. F45000.',
      'Edit a cell far from the top — the worker applies the change and recalculates the header summary without reloading the sheet.',
    ],
  },
  zh: {
    stats: `数据集：${rowsLabel} 行 × ${PERFORMANCE_COLS} 列（共 ${cellsLabel} 个单元格），通过 worker 的分块导入接口写入。`,
    tips: [
      '滚动网格——只有可见窗口（加一点预取余量）会从 worker 投影出来，其余行不会被触碰。',
      '用网格上方的名称框直接跳转到表格深处的单元格，例如 F45000。',
      '编辑一个远离顶部的单元格——worker 会应用修改并重新计算表头的汇总公式，无需重新加载整张表。',
    ],
  },
} as const

/**
 * Mirrors `FormulasGrid` (`FormulasDemo.tsx`): lives in its own component
 * so it can call `useSpreadsheetUiStore`/`useAtomValue`, which only
 * resolve once mounted inside `SpreadsheetChrome`'s `SpreadsheetUiProvider`
 * (reached via the `children` prop).
 */
function PerformanceGrid() {
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

export default function PerformanceDemo() {
  const t = useSiteT()
  const locale = useLocale()

  // Same lifecycle as `FormulasDemo.tsx`: a live Worker + WASM instance
  // built fresh per mount and disposed on unmount. `afterInit` runs the
  // chunked import once the worker's initial sheet handshake resolves.
  const backend = makeWasmWorkerBackend({
    sheets: performanceSheets,
    afterInit: seedPerformanceWorkbook,
  })

  onCleanup(() => backend.dispose())

  return (
    <div class="site-demo-basics">
      <aside class="site-demo-tips">
        <h2 class="site-demo-tips-heading">{copy[locale()].stats}</h2>
        <h2 class="site-demo-tips-heading">{t('site.demo.tryThis')}</h2>
        <ul class="site-demo-tips-list">
          <For each={copy[locale()].tips}>{(tip) => <li>{tip}</li>}</For>
        </ul>
      </aside>
      <SpreadsheetChrome backend={backend}>
        <PerformanceGrid />
      </SpreadsheetChrome>
    </div>
  )
}
