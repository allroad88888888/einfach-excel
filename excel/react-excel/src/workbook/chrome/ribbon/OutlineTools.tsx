import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  editingSessionAtom,
  nativeOutlineFeedbackAtom,
  projectionSnapshotAtom,
  runNativeOutlineAtom,
} from '@einfach-excel/spreadsheet-ui-core'

/** 与现有原生菜单一致；React 只把一次选择交给 command atom。 */
export function OutlineTools() {
  const { i18n, t } = useLingui()
  const OPTIONS = [
    ['group-rows', t`Group selected rows`, 'row', 'group'],
    ['group-columns', t`Group selected columns`, 'column', 'group'],
    ['ungroup-rows', t`Ungroup selected rows`, 'row', 'ungroup'],
    ['ungroup-columns', t`Ungroup selected columns`, 'column', 'ungroup'],
    ['collapse-rows', t`Collapse all row groups`, 'row', 'collapse'],
    ['expand-rows', t`Expand all row groups`, 'row', 'expand'],
    ['collapse-columns', t`Collapse all column groups`, 'column', 'collapse'],
    ['expand-columns', t`Expand all column groups`, 'column', 'expand'],
  ] as const

  const run = useSetAtom(runNativeOutlineAtom)
  const feedback = useAtomValue(nativeOutlineFeedbackAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const projection = useAtomValue(projectionSnapshotAtom)
  return (
    <>
      <select
        aria-label={t`Outline groups`}
        className="tool-select paste-options-select"
        value=""
        disabled={editing || feedback.busy || projection.status !== 'ready'}
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
        <option value="" disabled><Trans>
          Group / Outline
        </Trans></option>
        {OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {feedback.busy && <span role="status"><Trans>Updating outline…</Trans></span>}
      {feedback.error && <span role="alert">{translateFeedback(i18n, feedback.error)}</span>}
    </>
  )
}
