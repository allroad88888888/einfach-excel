import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  editingSessionAtom,
  runSelectionStructureAtom,
  selectionStructureFeedbackAtom,
  rustHistoryPanelAtom,
  sheetTabsAtom,
} from '@einfach/spreadsheet-ui-core'

const OPTIONS = [
  ['insert-rows', 'Insert selected rows'],
  ['insert-columns', 'Insert selected columns'],
  ['delete-rows', 'Delete selected rows'],
  ['delete-columns', 'Delete selected columns'],
] as const

/** 只收集插删方向；选区、画布边界与原生请求属于 UI Core command atom。 */
export function StructureTools() {
  const run = useSetAtom(runSelectionStructureAtom)
  const feedback = useAtomValue(selectionStructureFeedbackAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const history = useAtomValue(rustHistoryPanelAtom)
  const tabs = useAtomValue(sheetTabsAtom)
  return (
    <>
      <select
        className="tool-select paste-options-select"
        aria-label="Insert or delete rows and columns"
        value=""
        disabled={editing || feedback.busy || history.busy || !!tabs.mutation}
        onChange={(event) => {
          const option = OPTIONS.find(([value]) => value === event.currentTarget.value)
          if (option) void run(option[0])
        }}
      >
        <option value="" disabled>
          Insert / Delete
        </option>
        {OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {feedback.busy && <span role="status">Updating rows and columns…</span>}
      {feedback.error && <span role="alert">{feedback.error}</span>}
    </>
  )
}
