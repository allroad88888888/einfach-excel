/**
 * The "basics" demo: full chrome over a small team-roster sheet, plus a
 * compact "try this" tips panel. Backed by the static in-memory backend —
 * no worker, no WASM — so it is the cheapest demo to boot.
 */
import { For, Show, createEffect } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import { selectCellAtom, selectionAtom, workspaceSessionAtom } from '@einfach/spreadsheet-ui-core'
import type { ViewportMetrics } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetGrid, useSpreadsheetUiStore } from '@einfach/solid-excel/vnext'
import SpreadsheetChrome from '../../spreadsheet/SpreadsheetChrome'
import { makeStaticBackend } from '../../spreadsheet/backends'
import { useLocale, useSiteT } from '../../i18n/use-site-t'
import { basicsSeed } from '../seeds/seed-basics'

const backend = makeStaticBackend(basicsSeed)

const viewport: ViewportMetrics = {
  scrollTop: 0,
  scrollLeft: 0,
  viewportHeight: 380,
  viewportWidth: 720,
  rowHeight: 24,
  colWidth: 120,
  rowCount: 100,
  colCount: 20,
  overscanRows: 2,
  overscanCols: 2,
}

const copy = {
  en: {
    tips: [
      'Click a cell, then start typing to overwrite it.',
      'Enter, Tab, and the arrow keys move the active cell.',
      'Press F2 to edit a cell in place without clearing it.',
      'Drag across cells to select a range — the status bar shows sum, average, and count.',
      'Cmd/Ctrl+Z undoes the last edit.',
    ],
  },
  zh: {
    tips: [
      '点击一个单元格，直接输入即可覆盖原内容。',
      'Enter、Tab 和方向键可以移动当前单元格。',
      '按 F2 可以在不清空原内容的情况下就地编辑。',
      '拖动选中一个区域——状态栏会显示求和、平均值与计数。',
      'Cmd/Ctrl+Z 撤销上一步编辑。',
    ],
  },
} as const

/**
 * The grid itself lives in a helper component (rather than inline in
 * `BasicsDemo`) so it can call `useSpreadsheetUiStore`/`useAtomValue` —
 * those only resolve once mounted inside `SpreadsheetChrome`'s
 * `SpreadsheetUiProvider`, which happens via the `children` prop.
 */
function BasicsGrid() {
  const store = useSpreadsheetUiStore()
  const workspace = useAtomValue(workspaceSessionAtom)
  const activeSheetId = () => workspace().activeSheetId

  // `SpreadsheetChrome` always mounts `SpreadsheetSheetTabs` with an empty
  // seed list, which resolves the real active sheet asynchronously from
  // `backend.listSheets()`. Once it lands, default the cursor to A1 (Excel
  // convention) if nothing has selected a cell yet.
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

export default function BasicsDemo() {
  const t = useSiteT()
  const locale = useLocale()

  return (
    <div class="site-demo-basics">
      <aside class="site-demo-tips">
        <h2 class="site-demo-tips-heading">{t('site.demo.tryThis')}</h2>
        <ul class="site-demo-tips-list">
          <For each={copy[locale()].tips}>{(tip) => <li>{tip}</li>}</For>
        </ul>
      </aside>
      <SpreadsheetChrome backend={backend}>
        <BasicsGrid />
      </SpreadsheetChrome>
    </div>
  )
}
