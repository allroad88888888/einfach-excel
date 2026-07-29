/**
 * The "dynamic-arrays" demo: full chrome over a sales-by-region table with
 * three spill anchors (UNIQUE / SORT / FILTER), backed by the in-process
 * TS formula engine through a Web Worker. Spill is implemented by the
 * excel-core-ts worker runtime (Wave E1, see
 * `excel/solid-excel/test/excel-core-ts-spill.test.ts`): a formula that
 * evaluates to an array `Value` spills from its anchor cell into the empty
 * cells around it, and edits to the source table re-evaluate every anchor
 * that reads it.
 */
import { For, Show, createEffect, onCleanup } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import { selectCellAtom, selectionAtom, workspaceSessionAtom } from '@einfach/spreadsheet-ui-core'
import type { ViewportMetrics } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetGrid, useSpreadsheetUiStore } from '@einfach/solid-excel/vnext'
import SpreadsheetChrome from '../../spreadsheet/SpreadsheetChrome'
import { makeTsWorkerBackend } from '../../spreadsheet/backends'
import { useLocale, useSiteT } from '../../i18n/use-site-t'
import { dynamicArraysSheets, seedDynamicArraysWorkbook } from '../seeds/seed-dynamic-arrays'

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
      'Edit a Sales value (e.g. B3) — SORT and FILTER both reflow at once; UNIQUE stays put.',
      'Click D2, the UNIQUE anchor — the formula bar shows =UNIQUE(A2:A9).',
      'Click D3, a spilled cell — the formula bar goes blank: it only projects the anchor’s array.',
      'Type into a cell inside a spilled block (e.g. F5) — its anchor turns to #SPILL! until cleared.',
    ],
  },
  zh: {
    tips: [
      '修改一个 Sales 数值（比如 B3）—— SORT 和 FILTER 会立刻重新排布；UNIQUE 保持不变。',
      '点击 D2，UNIQUE 的锚点 —— 编辑栏会显示 =UNIQUE(A2:A9)。',
      '点击 D3，一个溢出单元格 —— 编辑栏是空的：它只是投影锚点的数组。',
      '在溢出区域内输入内容（比如 F5）—— 对应锚点会变成 #SPILL!，直到清空为止。',
    ],
  },
} as const

/**
 * Mirrors `FormulasGrid` (`FormulasDemo.tsx`): lives in its own component so
 * it can call `useSpreadsheetUiStore`/`useAtomValue`, which only resolve
 * once mounted inside `SpreadsheetChrome`'s `SpreadsheetUiProvider` (reached
 * via the `children` prop).
 */
function DynamicArraysGrid() {
  const store = useSpreadsheetUiStore()
  const workspace = useAtomValue(workspaceSessionAtom)
  const activeSheetId = () => workspace().activeSheetId

  // Same convention as `FormulasGrid`/`BasicsGrid`: `SpreadsheetChrome`
  // mounts `SpreadsheetSheetTabs` with an empty seed list and resolves the
  // real active sheet asynchronously from `backend.listSheets()`. Once it
  // lands, default the cursor to A1 if nothing has selected a cell yet.
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

export default function DynamicArraysDemo() {
  const t = useSiteT()
  const locale = useLocale()

  // Live Worker + in-process TS engine, same lifecycle as `FormulasDemo`:
  // built fresh per mount, disposed on unmount. Every backend method awaits
  // its own `ready()` handshake internally, so mounting `SpreadsheetChrome`
  // immediately is the working pattern here too.
  const backend = makeTsWorkerBackend({
    sheets: dynamicArraysSheets,
    afterInit: seedDynamicArraysWorkbook,
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
        <DynamicArraysGrid />
      </SpreadsheetChrome>
    </div>
  )
}
