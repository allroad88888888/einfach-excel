/**
 * The "protection-print" demo: an invoice sheet that is already protected
 * on load — item names, the header block, and every formula cell (Line
 * Total / Subtotal / Tax / Total) are locked, while the Qty and Unit Price
 * columns stay explicitly unlocked. A print area + one manual page break
 * are pre-configured so File -> Print Preview has something to show.
 * Backed by the static in-memory backend, same as `BasicsDemo`.
 *
 * The static backend's `StaticSpreadsheetSeed` has no protection/print
 * slots (that state is UI-core canonical, not backend-seeded — see
 * `excel/spreadsheet-ui-core/src/protection/README.md`), so this page
 * seeds it itself via `protectSheetAtom` / `setPrintConfigAtom` once the
 * sheet id resolves, mirroring how `BasicsDemo` defaults the cursor.
 */
import { For, Show, createEffect } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import {
  contentMutationLastBlockAtom,
  protectSheetAtom,
  selectCellAtom,
  selectionAtom,
  setPrintConfigAtom,
  workspaceSessionAtom,
} from '@einfach/spreadsheet-ui-core'
import type { ViewportMetrics } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetGrid, useSpreadsheetUiStore } from '@einfach/solid-excel/vnext'
import SpreadsheetChrome from '../../spreadsheet/SpreadsheetChrome'
import { makeStaticBackend } from '../../spreadsheet/backends'
import { useLocale, useSiteT } from '../../i18n/use-site-t'
import {
  invoicePrintConfig,
  invoiceUnlockedRange,
  protectionPrintSeed,
} from '../seeds/seed-protection-print'

const backend = makeStaticBackend(protectionPrintSeed)

const viewport: ViewportMetrics = {
  scrollTop: 0,
  scrollLeft: 0,
  viewportHeight: 380,
  viewportWidth: 640,
  rowHeight: 24,
  colWidth: 120,
  rowCount: 60,
  colCount: 12,
  overscanRows: 2,
  overscanCols: 2,
}

const copy = {
  en: {
    tips: [
      'This sheet is already protected — everything is locked except the Qty and Unit Price columns (rows 7-11).',
      'Click a Qty or Unit Price cell and type a number: it is the only unlocked range, so the edit applies at once and Line Total, Subtotal, Tax, and Total recalculate.',
      'Click a locked cell (an item name, or any total) and press Delete — nothing happens; the line below reports why.',
      'Select a locked cell, then use the menu bar: Format -> Unlock Range… opens the protection unlock dialog for that selection.',
      'Open File -> Print Preview to see the print area, landscape orientation, and page break already configured for this sheet.',
    ],
    feedbackIdle: 'No blocked edits yet — try Delete on a locked cell above.',
    feedbackPrefix: 'Blocked: ',
  },
  zh: {
    tips: [
      '此工作表已启用保护——除 Qty(数量)和 Unit Price(单价)两列(第 7-11 行)外,其余单元格均已锁定。',
      '点击一个 Qty 或 Unit Price 单元格并输入数字:这是唯一解锁的区域,修改立即生效,Line Total、Subtotal、Tax、Total 也会重新计算。',
      '点击一个锁定单元格(如商品名称或任意合计项)并按 Delete——不会有任何变化;下方这行会说明原因。',
      '选中一个锁定单元格,然后在菜单栏使用:格式 -> 解锁区域… 打开针对该选区的保护解锁对话框。',
      '打开“文件 -> 打印预览”查看已为该工作表配置好的打印区域、横向纸张方向与分页符。',
    ],
    feedbackIdle: '目前还没有被拦截的编辑——试试在上方锁定单元格上按 Delete。',
    feedbackPrefix: '已拦截: ',
  },
} as const

/**
 * Grid + live protection feedback, both mounted inside `SpreadsheetChrome`'s
 * `children` (so `useAtomValue`/`useSpreadsheetUiStore` resolve — see
 * `BasicsDemo.tsx`'s `BasicsGrid` for the same constraint). The feedback
 * line reads `contentMutationLastBlockAtom`, the same diagnostic the
 * mutation gateway records for every blocked paste/fill/delete/format
 * attempt against a locked cell — it stays outside the tips `<aside>`
 * because that aside renders as a sibling of `SpreadsheetChrome`, outside
 * the `SpreadsheetUiProvider` this atom needs.
 */
function ProtectionPrintGrid() {
  const locale = useLocale()
  const store = useSpreadsheetUiStore()
  const workspace = useAtomValue(workspaceSessionAtom)
  const lastBlock = useAtomValue(contentMutationLastBlockAtom)
  const activeSheetId = () => workspace().activeSheetId

  let seeded = false
  createEffect(() => {
    const sheetId = activeSheetId()
    if (!sheetId) return
    if (!seeded) {
      seeded = true
      store.setter(protectSheetAtom, { sheetId, unlockedRanges: [invoiceUnlockedRange] })
      store.setter(setPrintConfigAtom, { sheetId, config: invoicePrintConfig })
    }
    if (store.getter(selectionAtom).sheetId) return
    // Land the cursor on the first Qty cell (the unlocked range) rather
    // than A1 — A1 is the locked invoice title, and starting inside the
    // one editable range makes "type here, it works" the first thing seen.
    store.setter(selectCellAtom, { sheetId, coord: { row: 6, col: 1 } })
  })

  return (
    <>
      <p class="site-demo-protection-feedback" data-testid="protection-feedback">
        <Show when={lastBlock()} fallback={copy[locale()].feedbackIdle}>
          {(blocked) => `${copy[locale()].feedbackPrefix}${blocked().diagnostic.message}`}
        </Show>
      </p>
      <Show keyed when={activeSheetId()}>
        {(sheetId) => <SpreadsheetGrid sheetId={sheetId} viewport={viewport} />}
      </Show>
    </>
  )
}

export default function ProtectionPrintDemo() {
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
        <ProtectionPrintGrid />
      </SpreadsheetChrome>
    </div>
  )
}
