import { translateFeedback } from '../../../i18n/translate-feedback'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  editingSessionAtom,
  runSelectionVisibilityAtom,
  selectionVisibilityFeedbackAtom,
} from '@einfach/spreadsheet-ui-core'
import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'

const OPTIONS = [
  ['hide-rows', msg`Hide selected rows`],
  ['hide-columns', msg`Hide selected columns`],
  ['unhide', msg`Unhide selected rows and columns`],
  ['unhide-all', msg`Unhide all rows and columns`],
] as const

/** 原生 select 只收集一次操作；状态、校验与数据写入由 UI Core / Rust 负责。 */
export function VisibilityTools() {
  const { i18n, t } = useLingui()
  const run = useSetAtom(runSelectionVisibilityAtom)
  const feedback = useAtomValue(selectionVisibilityFeedbackAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  return (
    <>
      <select
        className="tool-select paste-options-select"
        aria-label={t`Row and column visibility`}
        value=""
        disabled={editing || feedback.busy}
        onChange={(event) => {
          const option = OPTIONS.find(([value]) => value === event.currentTarget.value)
          if (option) void run(option[0])
        }}
      >
        <option value="" disabled><Trans>
          Hide / Unhide
        </Trans></option>
        {OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>
            {i18n._(label)}
          </option>
        ))}
      </select>
      {feedback.busy && <span role="status"><Trans>Updating visibility…</Trans></span>}
      {feedback.error && <span role="alert">{translateFeedback(i18n, feedback.error)}</span>}
    </>
  )
}
