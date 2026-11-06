import { RibbonItem } from './RibbonItem'
import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  editingSessionAtom,
  openShiftCellsDialogAtom,
  runSelectionStructureAtom,
  selectionStructureFeedbackAtom,
  rustHistoryPanelAtom,
  sheetTabsAtom,
} from '@einfach-excel/spreadsheet-ui-core'

/** 只收集插删方向；选区、画布边界与原生请求属于 UI Core command atom。 */
export function StructureTools() {
  const { i18n, t } = useLingui()
  const OPTIONS = [
    ['insert-rows', t`Insert selected rows`],
    ['insert-columns', t`Insert selected columns`],
    ['delete-rows', t`Delete selected rows`],
    ['delete-columns', t`Delete selected columns`],
  ] as const
  const CELL_OPTIONS = [
    ['insert', t`Insert cells…`],
    ['delete', t`Delete cells…`],
  ] as const

  const run = useSetAtom(runSelectionStructureAtom)
  const openCells = useSetAtom(openShiftCellsDialogAtom)
  const feedback = useAtomValue(selectionStructureFeedbackAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const history = useAtomValue(rustHistoryPanelAtom)
  const tabs = useAtomValue(sheetTabsAtom)
  return (
    <>
      <RibbonItem id="structure.insert-or-delete-rows-and-columns">
        <select
          data-ribbon-item="structure.insert-or-delete-rows-and-columns"
          className="tool-select paste-options-select"
          aria-label={t`Insert or delete rows and columns`}
          value=""
          disabled={editing || feedback.busy || history.busy || !!tabs.mutation}
          onChange={(event) => {
            const value = event.currentTarget.value
            const option = OPTIONS.find(([key]) => key === value)
            const cells = CELL_OPTIONS.find(([key]) => `${key}-cells` === value)
            if (option) void run(option[0])
            else if (cells) void openCells({ mode: cells[0], source: 'menu' })
          }}
        >
          <option value="" disabled>
            <Trans>Insert / Delete</Trans>
          </option>
          {CELL_OPTIONS.map(([mode, label]) => (
            <option key={mode} value={`${mode}-cells`}>
              {label}
            </option>
          ))}
          {OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </RibbonItem>
      {feedback.busy && (
        <span role="status">
          <Trans>Updating rows and columns…</Trans>
        </span>
      )}
      {feedback.error && <span role="alert">{translateFeedback(i18n, feedback.error)}</span>}
    </>
  )
}
