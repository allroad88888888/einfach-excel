/**
 * The "conditional-formatting" demo: a sales-performance sheet with two
 * conditional format rules pre-registered on the Growth % column (green for
 * double-digit growth, red for decline) — applied through the real
 * `backend.setConditionalFormatRule` port before first mount, so the grid
 * shows color the moment it loads and the fill recomputes on every edit.
 * See `seed-conditional-formatting.ts` for the rule shapes and the
 * undo-stack trade-off that choice carries. Backed by the static in-memory
 * backend — no worker, no WASM.
 */
import { For, Show, createEffect } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import { selectCellAtom, selectionAtom, workspaceSessionAtom } from '@einfach/spreadsheet-ui-core'
import type { ViewportMetrics } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetGrid, useSpreadsheetUiStore } from '@einfach/solid-excel/vnext'
import SpreadsheetChrome from '../../spreadsheet/SpreadsheetChrome'
import { makeStaticBackend } from '../../spreadsheet/backends'
import { useLocale, useSiteT } from '../../i18n/use-site-t'
import {
  conditionalFormattingRuleRequests,
  conditionalFormattingSeed,
} from '../seeds/seed-conditional-formatting'

const backend = makeStaticBackend(conditionalFormattingSeed)

// `setConditionalFormatRuleInState` (static-backend.ts) runs synchronously —
// no `await` inside — so by the time `SpreadsheetGrid` mounts and issues its
// first `readVisibleProjection`, both rules are already in
// `conditionalFormatRulesBySheetId` and the initial read comes back colored.
for (const request of conditionalFormattingRuleRequests) {
  void backend.setConditionalFormatRule?.(request)
}

const viewport: ViewportMetrics = {
  scrollTop: 0,
  scrollLeft: 0,
  viewportHeight: 380,
  viewportWidth: 720,
  rowHeight: 24,
  colWidth: 110,
  rowCount: 100,
  colCount: 20,
  overscanRows: 2,
  overscanCols: 2,
}

const copy = {
  en: {
    tips: [
      'Growth % above 10 is green, below 0 is red — the rules read live cell values, not a fixed snapshot.',
      'Edit a Growth % cell across a threshold (10 or 0) and watch its color flip immediately.',
      'Open "Conditional formatting" from the toolbar to inspect the pre-seeded rules, or add and edit your own.',
      'Rules are matched top to bottom by priority — the first one that matches a cell wins.',
    ],
  },
  zh: {
    tips: [
      '增长率高于 10 显示绿色，低于 0 显示红色——规则读取的是实时单元格的值，而非固定快照。',
      '把某个增长率单元格改到阈值(10 或 0)的另一侧，颜色会立即翻转。',
      '从工具栏打开"条件格式"可以查看预置的规则，也可以自己新增或编辑。',
      '规则按优先级从上到下匹配，第一条命中的规则生效。',
    ],
  },
} as const

/**
 * Mirrors `BasicsGrid` (`BasicsDemo.tsx`): lives in its own component so it
 * can call `useSpreadsheetUiStore`/`useAtomValue`, which only resolve once
 * mounted inside `SpreadsheetChrome`'s `SpreadsheetUiProvider` (reached via
 * the `children` prop).
 */
function ConditionalFormattingGrid() {
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

export default function ConditionalFormattingDemo() {
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
        <ConditionalFormattingGrid />
      </SpreadsheetChrome>
    </div>
  )
}
