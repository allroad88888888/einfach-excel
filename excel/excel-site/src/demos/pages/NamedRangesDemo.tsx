/**
 * The "named-ranges" demo: pre-registers three named ranges (Revenue,
 * Expenses, TotalRow) on a small budget sheet before the chrome ever mounts,
 * so the name box dropdown and Name Manager both show them at load. This is
 * why `SpreadsheetChrome` gets an explicit `namedRangeCapabilityPort` here —
 * named ranges are capability-gated in ui-core (`loadNamedRangeCapabilitiesAtom`
 * / `reserveRegistryReadAtom`): without the port the registry read never
 * fires at all, no matter what the backend already holds. See
 * `createStaticNamedRangeCapabilityPort` and
 * `excel/spreadsheet-ui-core/src/named-ranges/README.md`.
 */
import { For, Show, createEffect, createResource } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import { selectCellAtom, selectionAtom, workspaceSessionAtom } from '@einfach/spreadsheet-ui-core'
import type { ViewportMetrics } from '@einfach/spreadsheet-ui-core'
import {
  createStaticNamedRangeCapabilityPort,
  SpreadsheetGrid,
  useSpreadsheetUiStore,
} from '@einfach/solid-excel/vnext'
import SpreadsheetChrome from '../../spreadsheet/SpreadsheetChrome'
import { makeStaticBackend } from '../../spreadsheet/backends'
import { useLocale, useSiteT } from '../../i18n/use-site-t'
import {
  NAMED_RANGES_SHEET_ID,
  namedRangesPreset,
  namedRangesSeed,
} from '../seeds/seed-named-ranges'

const backend = makeStaticBackend(namedRangesSeed)
const namedRangeCapabilityPort = createStaticNamedRangeCapabilityPort()

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

/**
 * Registers every `namedRangesPreset` entry on `backend` and resolves once
 * all of them have landed. The grid below only mounts `SpreadsheetChrome`
 * after this resolves (the `<Show>` gate in the component), so the very
 * first named-range registry read the provider issues on mount already sees
 * all three names — no reliance on import/module timing.
 */
async function registerPresetNamedRanges(): Promise<true> {
  for (const preset of namedRangesPreset) {
    await backend.setNamedRange?.({
      kind: 'set-named-range',
      name: preset.name,
      scope: 'workbook',
      refersTo: { kind: 'range', sheetId: NAMED_RANGES_SHEET_ID, address: preset.address },
    })
  }
  return true
}

const copy = {
  en: {
    tips: [
      'Type "Revenue", "Expenses", or "TotalRow" into the name box (top-left, above the row numbers) and press Enter — the selection jumps straight to that range.',
      'Select any range, type a new name into the name box, then press Enter — that defines a brand-new named range.',
      'Open Name Manager from the toolbar to see, edit, or delete every named range in this workbook.',
      'Press Ctrl/Cmd+G to open Go To, then type a name or an address like B3 to jump there.',
    ],
  },
  zh: {
    tips: [
      '在名称框（左上角，行号上方）输入 "Revenue"、"Expenses" 或 "TotalRow" 并回车——选区会直接跳转到对应区域。',
      '选中任意区域后在名称框输入一个新名称并回车，即可定义一个新的命名区域。',
      '从工具栏打开名称管理器，可以查看、编辑或删除工作簿中的所有命名区域。',
      '按 Ctrl/Cmd+G 打开定位，输入名称或地址（如 B3）即可跳转。',
    ],
  },
} as const

/**
 * Mirrors `BasicsGrid` (`BasicsDemo.tsx`): lives in its own component so it
 * can call `useSpreadsheetUiStore`/`useAtomValue`, which only resolve once
 * mounted inside `SpreadsheetChrome`'s `SpreadsheetUiProvider` (reached via
 * the `children` prop).
 */
function NamedRangesGrid() {
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

export default function NamedRangesDemo() {
  const t = useSiteT()
  const locale = useLocale()
  const [namedRangesReady] = createResource(registerPresetNamedRanges)

  return (
    <div class="site-demo-basics">
      <aside class="site-demo-tips">
        <h2 class="site-demo-tips-heading">{t('site.demo.tryThis')}</h2>
        <ul class="site-demo-tips-list">
          <For each={copy[locale()].tips}>{(tip) => <li>{tip}</li>}</For>
        </ul>
      </aside>
      <Show when={namedRangesReady()}>
        <SpreadsheetChrome backend={backend} namedRangeCapabilityPort={namedRangeCapabilityPort}>
          <NamedRangesGrid />
        </SpreadsheetChrome>
      </Show>
    </div>
  )
}
