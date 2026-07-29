/**
 * The "find-replace" demo: full chrome over a small product catalog whose
 * data is engineered to make every find/replace capability legible — see
 * `seed-find-replace.ts` for the exact match counts each tip below relies
 * on. The dialog itself is not mounted here: `ChromeDialogs` (mounted by
 * `SpreadsheetChrome`) already renders `SpreadsheetFindReplaceDialog`
 * globally, opened from the toolbar's "Find and replace" button or
 * Cmd/Ctrl+F (also Cmd/Ctrl+H, which lands on the Replace tab) — see
 * `SpreadsheetGrid.tsx`'s keydown handler.
 */
import { For, Show, createEffect } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import { selectCellAtom, selectionAtom, workspaceSessionAtom } from '@einfach/spreadsheet-ui-core'
import type { ViewportMetrics } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetGrid, useSpreadsheetUiStore } from '@einfach/solid-excel/vnext'
import SpreadsheetChrome from '../../spreadsheet/SpreadsheetChrome'
import { makeStaticBackend } from '../../spreadsheet/backends'
import { useLocale, useSiteT } from '../../i18n/use-site-t'
import { findReplaceSeed } from '../seeds/seed-find-replace'

const backend = makeStaticBackend(findReplaceSeed)

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
      'Open Find and replace from the toolbar, or press Cmd/Ctrl+F.',
      'Search "Widget" — 10 matches across the Product column. Step through them with ↓/↑.',
      'Turn on "Case sensitive" — the count drops to 7, since widget mini and WIDGET PRO/Deluxe no longer match.',
      'Search "Stock" — every Status cell contains it (15 matches). Turn on "Match entire cell" and it drops to 0, because no cell is exactly "Stock".',
      'Switch to the Replace tab, replace with "Module": Replace changes one match at a time, Replace all changes every remaining one.',
      'Check "Search formulas" and search "SUM" — it only finds the two totals-row formula cells, not their displayed values.',
    ],
  },
  zh: {
    tips: [
      '从工具栏打开"查找和替换"，或按 Cmd/Ctrl+F。',
      '搜索 "Widget"——Product 列共 10 处匹配，用 ↓/↑ 逐个查看。',
      '勾选"区分大小写"——匹配数降为 7，因为 widget mini 和 WIDGET PRO/Deluxe 不再匹配。',
      '搜索 "Stock"——每个 Status 单元格都包含它（15 处匹配）。勾选"匹配整个单元格"后降为 0，因为没有单元格内容正好是 "Stock"。',
      '切换到替换标签页，替换为 "Module"：单击"替换"只改当前一处，"全部替换"会改完剩余全部。',
      '勾选"搜索公式"并搜索 "SUM"——只会命中合计行的两个公式单元格，而不是它们显示的数值。',
    ],
  },
} as const

/**
 * The grid itself lives in a helper component (rather than inline in
 * `FindReplaceDemo`) so it can call `useSpreadsheetUiStore`/`useAtomValue` —
 * those only resolve once mounted inside `SpreadsheetChrome`'s
 * `SpreadsheetUiProvider`, which happens via the `children` prop.
 */
function FindReplaceGrid() {
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

export default function FindReplaceDemo() {
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
        <FindReplaceGrid />
      </SpreadsheetChrome>
    </div>
  )
}
