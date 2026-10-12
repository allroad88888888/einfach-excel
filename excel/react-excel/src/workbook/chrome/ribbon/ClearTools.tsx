import { useAtomValue, useSetAtom } from '@einfach/react'
import { clearSelectionAtom, editingSessionAtom,
  selectionMutationFeedbackAtom } from '@einfach/spreadsheet-ui-core'

const OPTIONS = [
  ['contents', 'Clear contents', '⌫'],
  ['formats', 'Clear formatting', 'A×'],
  ['all', 'Clear all', '×'],
] as const

/** 按钮只派发模式；多区域目标、等待和失败由同一个 UI Core 命令负责。 */
export function ClearTools() {
  const clear = useSetAtom(clearSelectionAtom)
  const busy = useAtomValue(selectionMutationFeedbackAtom).busy
  const editing = useAtomValue(editingSessionAtom).source !== null
  return <>{OPTIONS.map(([mode, label, icon]) => (
    <button key={mode} type="button" className="tool-button" aria-label={label} title={label}
      disabled={editing || busy} onClick={() => void clear(mode)}>
      <span aria-hidden="true">{icon}</span>
    </button>
  ))}</>
}
