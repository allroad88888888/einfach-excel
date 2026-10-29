import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  directionalFillFeedbackAtom,
  editingSessionAtom,
  fillSelectionAtom,
} from '@einfach-excel/spreadsheet-ui-core'

/** 只收集填充方向；源区域、原生写入及结果发布由同一个 command 负责。 */
export function FillTools() {
  const { i18n, t } = useLingui()
  const fill = useSetAtom(fillSelectionAtom)
  const feedback = useAtomValue(directionalFillFeedbackAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  return (
    <>
      <select
        className="tool-select paste-options-select"
        aria-label={t`Fill selected range`}
        title={t`Copy the first selected row down or the first selected column right`}
        value=""
        disabled={editing || feedback.busy}
        onChange={(event) => {
          const direction = event.currentTarget.value
          if (direction === 'down' || direction === 'right') void fill(direction)
        }}
      >
        <option value="" disabled><Trans>Fill</Trans></option>
        <option value="down"><Trans>Fill down (Ctrl/⌘+D)</Trans></option>
        <option value="right"><Trans>Fill right (Ctrl/⌘+R)</Trans></option>
      </select>
      {(feedback.message || feedback.error) && (
        <span className="fill-feedback" aria-label={t`Fill status`} role={feedback.error ? 'alert' : 'status'}>
          {translateFeedback(i18n, feedback.error || feedback.message)}
        </span>
      )}
    </>
  )
}
