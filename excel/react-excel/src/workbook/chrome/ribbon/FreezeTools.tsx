import { translateFeedback } from '../../../i18n/translate-feedback'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  editingSessionAtom,
  activeWorkbookSheetAtom,
  freezeFeedbackAtom,
  projectedFreezeAtom,
  projectionSnapshotAtom,
  runFreezeAtom,
} from '@einfach/spreadsheet-ui-core'
import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'

const OPTIONS = [
  ['first-row', msg`Freeze top row`],
  ['first-column', msg`Freeze first column`],
  ['selection', msg`Freeze at active cell`],
  ['unfreeze', msg`Unfreeze panes`],
] as const

/** 菜单只提交动作，当前冻结状态直接读原生投影。 */
export function FreezeTools() {
  const { i18n, t } = useLingui()
  const run = useSetAtom(runFreezeAtom)
  const feedback = useAtomValue(freezeFeedbackAtom)
  const freeze = useAtomValue(projectedFreezeAtom)
  const sheet = useAtomValue(activeWorkbookSheetAtom)
  const projection = useAtomValue(projectionSnapshotAtom)
  const ready = projection.status === 'ready' && projection.request?.sheetId === sheet?.id
  const editing = useAtomValue(editingSessionAtom).source !== null
  const frozen = Boolean(freeze && freeze.sheetId === sheet?.id && (freeze.rows || freeze.cols))
  return (
    <>
      <select
        className="tool-select paste-options-select"
        aria-label={t`Freeze panes`}
        value=""
        disabled={!ready || editing || feedback.busy}
        onChange={(event) => {
          const option = OPTIONS.find(([value]) => value === event.currentTarget.value)
          if (option) void run(option[0])
        }}
      >
        <option value="" disabled>
          {frozen ? t`Panes frozen` : t`Freeze panes`}
        </option>
        {OPTIONS.map(([value, label]) => (
          <option key={value} value={value} disabled={value === 'unfreeze' && !frozen}>
            {i18n._(label)}
          </option>
        ))}
      </select>
      {feedback.busy && <span role="status"><Trans>Updating freeze…</Trans></span>}
      {feedback.error && <span role="alert">{translateFeedback(i18n, feedback.error)}</span>}
    </>
  )
}
