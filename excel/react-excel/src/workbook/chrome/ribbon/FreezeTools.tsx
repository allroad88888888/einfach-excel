import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  editingSessionAtom,
  activeWorkbookSheetAtom,
  freezeFeedbackAtom,
  projectedFreezeAtom,
  runFreezeAtom,
} from '@einfach/spreadsheet-ui-core'

const OPTIONS = [
  ['first-row', 'Freeze top row'],
  ['first-column', 'Freeze first column'],
  ['selection', 'Freeze at active cell'],
  ['unfreeze', 'Unfreeze panes'],
] as const

/** 菜单只提交动作，当前冻结状态直接读原生投影。 */
export function FreezeTools() {
  const run = useSetAtom(runFreezeAtom)
  const feedback = useAtomValue(freezeFeedbackAtom)
  const freeze = useAtomValue(projectedFreezeAtom)
  const sheet = useAtomValue(activeWorkbookSheetAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const frozen = Boolean(freeze && freeze.sheetId === sheet?.id && (freeze.rows || freeze.cols))
  return (
    <>
      <select
        className="paste-options-select"
        aria-label="Freeze panes"
        value=""
        disabled={editing || feedback.busy}
        onChange={(event) => {
          const option = OPTIONS.find(([value]) => value === event.currentTarget.value)
          if (option) void run(option[0])
        }}
      >
        <option value="" disabled>
          {frozen ? 'Panes frozen' : 'Freeze panes'}
        </option>
        {OPTIONS.map(([value, label]) => (
          <option key={value} value={value} disabled={value === 'unfreeze' && !frozen}>
            {label}
          </option>
        ))}
      </select>
      {feedback.busy && <span role="status">Updating freeze…</span>}
      {feedback.error && <span role="alert">{feedback.error}</span>}
    </>
  )
}
