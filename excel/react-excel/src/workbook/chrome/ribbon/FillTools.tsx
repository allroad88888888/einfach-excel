import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  directionalFillFeedbackAtom,
  editingSessionAtom,
  fillSelectionAtom,
} from '@einfach/spreadsheet-ui-core'

/** 只收集填充方向；源区域、原生写入及结果发布由同一个 command 负责。 */
export function FillTools() {
  const fill = useSetAtom(fillSelectionAtom)
  const feedback = useAtomValue(directionalFillFeedbackAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  return (
    <>
      <select
        className="tool-select paste-options-select"
        aria-label="Fill selected range"
        title="Copy the first selected row down or the first selected column right"
        value=""
        disabled={editing || feedback.busy}
        onChange={(event) => {
          const direction = event.currentTarget.value
          if (direction === 'down' || direction === 'right') void fill(direction)
        }}
      >
        <option value="" disabled>Fill</option>
        <option value="down">Fill down (Ctrl/⌘+D)</option>
        <option value="right">Fill right (Ctrl/⌘+R)</option>
      </select>
      {(feedback.message || feedback.error) && (
        <span className="fill-feedback" aria-label="Fill status" role={feedback.error ? 'alert' : 'status'}>
          {feedback.error || feedback.message}
        </span>
      )}
    </>
  )
}
