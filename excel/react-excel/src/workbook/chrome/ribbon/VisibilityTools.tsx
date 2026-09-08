import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  editingSessionAtom,
  runSelectionVisibilityAtom,
  selectionVisibilityFeedbackAtom,
} from '@einfach/spreadsheet-ui-core'

const OPTIONS = [
  ['hide-rows', 'Hide selected rows'],
  ['hide-columns', 'Hide selected columns'],
  ['unhide', 'Unhide selected rows and columns'],
  ['unhide-all', 'Unhide all rows and columns'],
] as const

/** 原生 select 只收集一次操作；状态、校验与数据写入由 UI Core / Rust 负责。 */
export function VisibilityTools() {
  const run = useSetAtom(runSelectionVisibilityAtom)
  const feedback = useAtomValue(selectionVisibilityFeedbackAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  return (
    <>
      <select
        className="paste-options-select"
        aria-label="Row and column visibility"
        value=""
        disabled={editing || feedback.busy}
        onChange={(event) => {
          const option = OPTIONS.find(([value]) => value === event.currentTarget.value)
          if (option) void run(option[0])
        }}
      >
        <option value="" disabled>
          Hide / Unhide
        </option>
        {OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {feedback.busy && <span role="status">Updating visibility…</span>}
      {feedback.error && <span role="alert">{feedback.error}</span>}
    </>
  )
}
