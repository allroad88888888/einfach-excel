/**
 * The "data-validation" demo: full chrome over a small order-form sheet that
 * ships with three validation rules already in effect — see
 * `seed-data-validation.ts` for exactly which cells violate which rule and
 * why. The dialog itself is not mounted here: `ChromeDialogs` (mounted by
 * `SpreadsheetChrome`) already renders `SpreadsheetDataValidationDialog`
 * globally, opened from the toolbar's "Data validation" button.
 */
import { For, Show, createEffect } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import { selectCellAtom, selectionAtom, workspaceSessionAtom } from '@einfach/spreadsheet-ui-core'
import type { ViewportMetrics } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetGrid, useSpreadsheetUiStore } from '@einfach/solid-excel/vnext'
import SpreadsheetChrome from '../../spreadsheet/SpreadsheetChrome'
import { makeStaticBackend } from '../../spreadsheet/backends'
import { useLocale, useSiteT } from '../../i18n/use-site-t'
import { dataValidationSeed } from '../seeds/seed-data-validation'

const backend = makeStaticBackend(dataValidationSeed)

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
      'Three cells are already flagged: Qty on ORD-1003 (1500, above the 1-999 limit), Status on ORD-1004 ("Backordered" is not on the list), and Discount % on ORD-1005 (125%, over the 0-100 warn-only range).',
      'Hover a flagged cell — the red or amber outline carries a tooltip explaining which rule it broke.',
      'Reject-mode rules (Qty, Status) show red; the warn-mode rule (Discount %) shows a milder amber, since "warn" never blocks entry.',
      'Select a cell or range and open "Data validation" from the toolbar to author a rule for it: pick list/range/regex/formula, set warn or reject, then Save.',
      'Type any new value into a flagged cell — its diagnostic disappears immediately, since editing a cell always replaces it (even a value that still breaks the rule needs Save from the dialog to get re-flagged).',
    ],
  },
  zh: {
    tips: [
      '已有三处标记：ORD-1003 的 Qty（1500，超过 1-999 的上限）、ORD-1004 的 Status（"Backordered" 不在允许列表中）、ORD-1005 的 Discount %（125%，超过仅警告的 0-100 范围）。',
      '将鼠标悬停在标记的单元格上——红色或琥珀色边框会显示提示，说明违反了哪条规则。',
      '"拒绝"模式的规则（Qty、Status）显示红色；"警告"模式的规则（Discount %）显示较柔和的琥珀色，因为"警告"不会阻止输入。',
      '选中一个单元格或区域，从工具栏打开"数据验证"来为它编写规则：选择列表/范围/正则/公式，设置警告或拒绝，然后保存。',
      '往标记的单元格里输入任意新值——诊断标记会立刻消失，因为编辑单元格总会整体替换它（即便新值依旧违规，也要通过对话框的"保存"才会重新标记）。',
    ],
  },
} as const

/**
 * The grid itself lives in a helper component (rather than inline in
 * `DataValidationDemo`) so it can call `useSpreadsheetUiStore`/`useAtomValue`
 * — those only resolve once mounted inside `SpreadsheetChrome`'s
 * `SpreadsheetUiProvider`, which happens via the `children` prop.
 */
function DataValidationGrid() {
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

export default function DataValidationDemo() {
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
        <DataValidationGrid />
      </SpreadsheetChrome>
    </div>
  )
}
