import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  editingSessionAtom,
  nativeOutlineFeedbackAtom,
  runNativeOutlineAtom,
} from '@einfach/spreadsheet-ui-core'

const OPTIONS = [
  ['group-rows', 'Group selected rows', 'row', 'group'],
  ['group-columns', 'Group selected columns', 'column', 'group'],
  ['ungroup-rows', 'Ungroup selected rows', 'row', 'ungroup'],
  ['ungroup-columns', 'Ungroup selected columns', 'column', 'ungroup'],
  ['collapse-rows', 'Collapse all row groups', 'row', 'collapse'],
  ['expand-rows', 'Expand all row groups', 'row', 'expand'],
  ['collapse-columns', 'Collapse all column groups', 'column', 'collapse'],
  ['expand-columns', 'Expand all column groups', 'column', 'expand'],
] as const

/** 与现有原生菜单一致；React 只把一次选择交给 command atom。 */
export function OutlineTools() {
  const run = useSetAtom(runNativeOutlineAtom)
  const feedback = useAtomValue(nativeOutlineFeedbackAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  return (
    <>
      <select
        aria-label="Outline groups"
        className="paste-options-select"
        value=""
        disabled={editing || feedback.busy}
        onChange={(event) => {
          const option = OPTIONS.find(([value]) => value === event.currentTarget.value)
          if (!option) return
          const [, , axis, kind] = option
          void run({
            axis,
            action:
              kind === 'collapse' || kind === 'expand'
                ? { kind: 'show-level', level: kind === 'collapse' ? 1 : 9 }
                : { kind },
          })
        }}
      >
        <option value="" disabled>
          Group / Outline
        </option>
        {OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {feedback.busy && <span role="status">Updating outline…</span>}
      {feedback.error && <span role="alert">{feedback.error}</span>}
    </>
  )
}
