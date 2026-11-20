import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeSheetSplitWindowAtom,
  activeWorkbookSheetAtom,
  editingSessionAtom,
  projectionCommandReadyAtom,
  projectionSnapshotAtom,
  runSplitWindowAtom,
  type SplitWindowAction,
} from '@einfach-excel/spreadsheet-ui-core'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { RibbonItem } from './RibbonItem'

const OPTIONS: readonly (readonly [SplitWindowAction, ReturnType<typeof msg>])[] = [
  ['selection', msg`Split at active cell`],
  ['horizontal', msg`Split horizontally`],
  ['vertical', msg`Split vertically`],
  ['clear', msg`Remove split`],
]

/** View-tab split window selector backed by UI Core session split state. */
export function SplitTools() {
  const { i18n, t } = useLingui()
  const split = useAtomValue(activeSheetSplitWindowAtom)
  const sheet = useAtomValue(activeWorkbookSheetAtom)
  const projection = useAtomValue(projectionSnapshotAtom)
  const commandReady = useAtomValue(projectionCommandReadyAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const run = useSetAtom(runSplitWindowAtom)
  const ready = commandReady && projection.request?.sheetId === sheet?.id
  const isSplit = split.mode !== 'none'

  return (
    <RibbonItem id="view.split-window">
      <select
        data-ribbon-item="view.split-window"
        className="tool-select paste-options-select"
        aria-label={t`Split window`}
        value=""
        disabled={!ready || editing}
        onChange={(event) => {
          const option = OPTIONS.find(([value]) => value === event.currentTarget.value)
          if (option) void run(option[0])
        }}
      >
        <option value="" disabled>
          {isSplit ? t`Window split` : t`Split window`}
        </option>
        {OPTIONS.map(([value, label]) => (
          <option key={value} value={value} disabled={value === 'clear' && !isSplit}>
            {i18n._(label)}
          </option>
        ))}
      </select>
    </RibbonItem>
  )
}
