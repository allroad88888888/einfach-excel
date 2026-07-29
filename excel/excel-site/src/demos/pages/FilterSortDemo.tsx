/**
 * The "filter-sort" demo: an orders table backed by the static in-memory
 * backend, showing the toolbar Filter dropdown (per-column value hide/show)
 * and the toolbar Sort button (physical `sortRange`) side by side with a
 * SUBTOTAL-based totals row so hiding a category visibly moves the sum.
 */
import { For, Show, createEffect } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import { selectCellAtom, selectionAtom, workspaceSessionAtom } from '@einfach/spreadsheet-ui-core'
import type { ViewportMetrics } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetGrid, useSpreadsheetUiStore } from '@einfach/solid-excel/vnext'
import SpreadsheetChrome from '../../spreadsheet/SpreadsheetChrome'
import { makeStaticBackend } from '../../spreadsheet/backends'
import { useLocale, useSiteT } from '../../i18n/use-site-t'
import { filterSortSeed } from '../seeds/seed-filter-sort'

const backend = makeStaticBackend(filterSortSeed)

// Tall enough to render all 18 rows (header + 15 orders + spacer + totals)
// without scrolling, so the Filter dropdown's available-values scan — which
// reads whatever the grid currently has projected — sees every order row
// the first time it opens.
const viewport: ViewportMetrics = {
  scrollTop: 0,
  scrollLeft: 0,
  viewportHeight: 460,
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
      'Click a cell in the Category column, then click Filter in the toolbar to open its dropdown.',
      "Uncheck a category (e.g. Furniture) and confirm — its rows disappear and row numbers skip to show what's hidden.",
      'Click a cell in the Quantity column, then use the Sort button to reorder the 15 orders ascending or descending.',
      'The Total row is built from SUBTOTAL, not SUM — hide a category and its sum/average update; a plain SUM would not.',
      'Drag across a range of visible cells — the status bar sum/average/count only tallies what is on screen.',
    ],
  },
  zh: {
    tips: [
      '点击“类别”列中的一个单元格，再点击工具栏的“筛选”打开该列的下拉菜单。',
      '取消勾选某个类别（例如“家具”）并确认——对应的行会消失，行号会跳过被隐藏的行。',
      '点击“数量”列中的一个单元格，再用工具栏的“排序”按钮对 15 条订单做升序或降序排序。',
      '合计行用的是 SUBTOTAL 而不是 SUM——隐藏某个类别后合计/平均值会跟着更新，普通 SUM 不会。',
      '拖动选中一段可见单元格——状态栏的求和/平均值/计数只统计屏幕上看得见的部分。',
    ],
  },
} as const

/**
 * Grid lives in a helper component (rather than inline in `FilterSortDemo`)
 * so it can call `useSpreadsheetUiStore`/`useAtomValue` — those only resolve
 * once mounted inside `SpreadsheetChrome`'s `SpreadsheetUiProvider`, reached
 * here via the `children` prop.
 */
function FilterSortGrid() {
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

export default function FilterSortDemo() {
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
        <FilterSortGrid />
      </SpreadsheetChrome>
    </div>
  )
}
