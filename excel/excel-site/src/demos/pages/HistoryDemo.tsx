/**
 * The "history" demo: full chrome over a small supply-order sheet, plus the
 * library's `SpreadsheetHistoryTimeline` mounted as a right rail next to the
 * grid — same two-column arrangement `VNextWave5Demo.tsx` uses (`.vnext-
 * demo-body` / `.vnext-demo-main` / `.vnext-demo-sidebar`, all styled by
 * `history-panel.css` and `demo-two-column.css`, both already pulled in via
 * `@einfach/solid-excel/vnext-styles.css` in `main.tsx`). Backed by the
 * static in-memory backend — no worker, no WASM.
 */
import { For, Show, createEffect } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import { selectCellAtom, selectionAtom, workspaceSessionAtom } from '@einfach/spreadsheet-ui-core'
import type { ViewportMetrics } from '@einfach/spreadsheet-ui-core'
import {
  SpreadsheetGrid,
  SpreadsheetHistoryTimeline,
  useSpreadsheetUiStore,
} from '@einfach/solid-excel/vnext'
import SpreadsheetChrome from '../../spreadsheet/SpreadsheetChrome'
import { makeStaticBackend } from '../../spreadsheet/backends'
import { useLocale, useSiteT } from '../../i18n/use-site-t'
import { historySeed } from '../seeds/seed-history'

const backend = makeStaticBackend(historySeed)

const viewport: ViewportMetrics = {
  scrollTop: 0,
  scrollLeft: 0,
  viewportHeight: 380,
  viewportWidth: 480,
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
      'Edit a few cells — each one lands as its own entry on the timeline to the right.',
      'Cmd/Ctrl+Z undoes the last edit, Cmd/Ctrl+Y redoes it.',
      'Click an older entry in the timeline to jump straight to that point in the stack.',
      'The stack holds up to 100 entries; edit past that and the oldest one drops off.',
    ],
  },
  zh: {
    tips: [
      '编辑几个单元格——每一次都会在右侧时间线上出现一条独立记录。',
      'Cmd/Ctrl+Z 撤销上一步，Cmd/Ctrl+Y 重做。',
      '点击时间线中较早的一条记录，可以直接跳转到栈中的那个节点。',
      '历史栈最多保留 100 条记录，超出后最早的一条会被丢弃。',
    ],
  },
} as const

/**
 * Mirrors `BasicsGrid` (`BasicsDemo.tsx`): lives in its own component so it
 * can call `useSpreadsheetUiStore`/`useAtomValue`, which only resolve once
 * mounted inside `SpreadsheetChrome`'s `SpreadsheetUiProvider` (reached via
 * the `children` prop).
 */
function HistoryGrid() {
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

export default function HistoryDemo() {
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
        <div class="vnext-demo-body">
          <div class="vnext-demo-main">
            <HistoryGrid />
          </div>
          <aside class="vnext-demo-sidebar">
            <SpreadsheetHistoryTimeline data-testid="history-demo-timeline" />
          </aside>
        </div>
      </SpreadsheetChrome>
    </div>
  )
}
