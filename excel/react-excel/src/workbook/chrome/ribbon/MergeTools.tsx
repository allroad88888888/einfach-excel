import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  editingSessionAtom,
  runSelectionMergeAtom,
  selectionMergeFeedbackAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { MergeConfirmation } from './MergeConfirmation'
import { useRef } from 'react'

/** 合并菜单只发 command atom；确认、保护和数据写入不放进 React。 */
export function MergeTools() {
  const { i18n, t } = useLingui()
  const OPTIONS = [
    ['merge', t`Merge cells`],
    ['center', t`Merge and center`],
    ['unmerge', t`Unmerge cells`],
  ] as const

  const run = useSetAtom(runSelectionMergeAtom)
  const state = useAtomValue(selectionMergeFeedbackAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const menuRef = useRef<HTMLSelectElement>(null)
  return (
    <>
      <select
        ref={menuRef}
        className="tool-select paste-options-select"
        aria-label={t`Merge cells`}
        value=""
        disabled={editing || state.busy || state.pending !== null}
        onChange={(event) => {
          const option = OPTIONS.find(([value]) => value === event.currentTarget.value)
          if (option) void run(option[0])
        }}
      >
        <option value="" disabled><Trans>
          Merge / Unmerge
        </Trans></option>
        {OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {state.busy && <span role="status"><Trans>Merging cells…</Trans></span>}
      {state.error && <span role="alert">{translateFeedback(i18n, state.error)}</span>}
      <MergeConfirmation openerRef={menuRef} />
    </>
  )
}
