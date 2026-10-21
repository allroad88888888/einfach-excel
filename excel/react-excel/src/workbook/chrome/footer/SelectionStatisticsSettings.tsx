import { useLingui, Trans } from '@lingui/react/macro'
import { translateFeedback } from '../../../i18n/translate-feedback'
import { useEffect, useId, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  configureSelectionStatisticsAtom, selectionStatisticsPreferencesAtom,
  selectionStatisticLabels, type SelectionStatistic,
} from '@einfach/spreadsheet-ui-core'
import { cycleDialogFocus } from '../ribbon/dialog-focus'

/** 配置弹窗只处理原生对话框及焦点，勾选状态直接来自 UI Core。 */
export function SelectionStatisticsSettings() {
  const { t, i18n } = useLingui()
  const { open, visible } = useAtomValue(selectionStatisticsPreferencesAtom)
  const configure = useSetAtom(configureSelectionStatisticsAtom)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    const button = buttonRef.current
    if (dialog?.showModal) dialog.showModal()
    else dialog?.setAttribute('open', '')
    return () => {
      dialog?.close?.()
      button?.focus({ preventScroll: true })
    }
  }, [open])
  return <>
    <button ref={buttonRef} type="button" className="statistics-settings-button"
      aria-label={t`Selection statistics settings`} title={t`Selection statistics settings`}
      aria-haspopup="dialog" onClick={() => configure('open')}>⋯</button>
    {open && <dialog ref={dialogRef} className="statistics-settings" aria-labelledby={titleId}
      onKeyDown={cycleDialogFocus}
      onCancel={(event) => { event.preventDefault(); configure('close') }}>
      <h2 id={titleId}><Trans>Selection statistics</Trans></h2>
      <p><Trans>Choose the summaries shown below.
        Click a value to copy its full precision.</Trans></p>
      {(Object.keys(selectionStatisticLabels) as SelectionStatistic[]).map((statistic) =>
        <label key={statistic}>
          <input type="checkbox" checked={visible.includes(statistic)}
            onChange={(event) => configure({ statistic, visible: event.currentTarget.checked })} />
          {translateFeedback(i18n, selectionStatisticLabels[statistic])}
        </label>,
      )}
      <p><Trans>Applies to this workbook session. Reloading restores all six summaries.</Trans></p>
      <div className="statistics-settings-actions">
        <button type="button" onClick={() => configure('reset')}><Trans>Restore defaults</Trans></button>
        <button type="button" onClick={() => configure('close')}><Trans>Done</Trans></button>
      </div>
    </dialog>}
  </>
}
