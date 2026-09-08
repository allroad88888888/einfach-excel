import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  editingSessionAtom,
  runSelectionMergeAtom,
  selectionMergeFeedbackAtom,
} from '@einfach/spreadsheet-ui-core'
import { MergeConfirmation } from './MergeConfirmation'

const OPTIONS = [
  ['merge', 'Merge cells'],
  ['center', 'Merge and center'],
  ['unmerge', 'Unmerge cells'],
] as const

/** 合并菜单只发 command atom；确认、保护和数据写入不放进 React。 */
export function MergeTools() {
  const run = useSetAtom(runSelectionMergeAtom)
  const state = useAtomValue(selectionMergeFeedbackAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  return (
    <>
      <select
        className="tool-select paste-options-select"
        aria-label="Merge cells"
        value=""
        disabled={editing || state.busy || state.pending !== null}
        onChange={(event) => {
          const option = OPTIONS.find(([value]) => value === event.currentTarget.value)
          if (option) void run(option[0])
        }}
      >
        <option value="" disabled>
          Merge / Unmerge
        </option>
        {OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {state.busy && <span role="status">Merging cells…</span>}
      {state.error && <span role="alert">{state.error}</span>}
      <MergeConfirmation />
    </>
  )
}
