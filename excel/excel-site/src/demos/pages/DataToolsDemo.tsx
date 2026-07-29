/**
 * The "data-tools" demo: a messy import-style sheet (combined "Last,
 * First" names, exact-duplicate rows, a formula column) with the menu bar
 * enabled so the three data-cleanup tools are reachable the same way a
 * real user finds them — Data → Text to Columns, Data → Remove
 * Duplicates, Edit → Paste Special — rather than a bespoke toolbar button.
 * Backed by the static in-memory backend, which implements every port
 * these tools are capability-gated on (`importCellChunks`, `removeRows`,
 * `pasteRange`), so all three menu entries render enabled.
 */
import { For, Show, createEffect } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import { selectCellAtom, selectionAtom, workspaceSessionAtom } from '@einfach/spreadsheet-ui-core'
import type { ViewportMetrics } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetGrid, useSpreadsheetUiStore } from '@einfach/solid-excel/vnext'
import SpreadsheetChrome from '../../spreadsheet/SpreadsheetChrome'
import { makeStaticBackend } from '../../spreadsheet/backends'
import { useLocale, useSiteT } from '../../i18n/use-site-t'
import { dataToolsSeed } from '../seeds/seed-data-tools'

const backend = makeStaticBackend(dataToolsSeed)

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
      'Select column A (the combined "Last, First" names), then Data → Text to Columns — split by comma into separate Last and First columns.',
      'Select A2:E11 (all ten rows), then Data → Remove Duplicates — 3 duplicate rows removed, 7 unique rows remain.',
      'Copy the Total formula column (E2:E11), select F2, then Edit → Paste Special → Values only — pastes the numbers without the formulas.',
    ],
  },
  zh: {
    tips: [
      '选中 A 列（"姓, 名" 合并列），然后 数据 → 分列 —— 按逗号拆成姓和名两列。',
      '选中 A2:E11（全部十行），然后 数据 → 删除重复项 —— 会删除 3 行重复数据，保留 7 行。',
      '复制 Total 公式列（E2:E11），选中 F2，然后 编辑 → 选择性粘贴 → 仅数值 —— 只粘贴计算结果，不带公式。',
    ],
  },
} as const

/**
 * The grid itself lives in a helper component (rather than inline in
 * `DataToolsDemo`) so it can call `useSpreadsheetUiStore`/`useAtomValue` —
 * those only resolve once mounted inside `SpreadsheetChrome`'s
 * `SpreadsheetUiProvider`, which happens via the `children` prop.
 */
function DataToolsGrid() {
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

export default function DataToolsDemo() {
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
      <SpreadsheetChrome backend={backend} chrome={{ menuBar: true }}>
        <DataToolsGrid />
      </SpreadsheetChrome>
    </div>
  )
}
