import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  editingSessionAtom,
  repeatLabelAtom,
  repeatLastActionAtom,
  rustHistoryPanelAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { useLingui } from '@lingui/react/macro'
import { REPEAT_LABELS } from './repeat-labels'

/** 与撤销／重做并排：只在存在可重复动作时可用，提示里写出动作名。 */
export function RepeatButton() {
  const { i18n, t } = useLingui()
  const label = useAtomValue(repeatLabelAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const busy = useAtomValue(rustHistoryPanelAtom).busy
  const repeat = useSetAtom(repeatLastActionAtom)
  const action = label === null ? null : i18n._(REPEAT_LABELS[label])
  return (
    <button
      className="tool-button"
      type="button"
      aria-label={t`Repeat`}
      title={action === null ? t`Repeat (F4)` : t`Repeat ${action} (F4)`}
      disabled={editing || busy || label === null}
      onClick={() => void repeat()}
    >
      ↻
    </button>
  )
}
