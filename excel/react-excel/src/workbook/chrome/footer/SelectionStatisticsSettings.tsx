import { useEffect, useId, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  configureSelectionStatisticsAtom, selectionStatisticsPreferencesAtom,
  selectionStatisticLabels, type SelectionStatistic,
} from '@einfach/spreadsheet-ui-core'

/** 配置弹窗只处理原生对话框及焦点，勾选状态直接来自 UI Core。 */
export function SelectionStatisticsSettings() {
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
      aria-label="Selection statistics settings" title="Selection statistics settings"
      aria-haspopup="dialog" onClick={() => configure('open')}>⋯</button>
    {open && <dialog ref={dialogRef} className="statistics-settings" aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); configure('close') }}>
      <h2 id={titleId}>Selection statistics</h2>
      <p>Choose the summaries shown below. Click a value to copy its full precision.</p>
      {(Object.keys(selectionStatisticLabels) as SelectionStatistic[]).map((statistic) =>
        <label key={statistic}>
          <input type="checkbox" checked={visible.includes(statistic)}
            onChange={(event) => configure({ statistic, visible: event.currentTarget.checked })} />
          {selectionStatisticLabels[statistic]}
        </label>,
      )}
      <p>Applies to this workbook session. Reloading restores all six summaries.</p>
      <div className="statistics-settings-actions">
        <button type="button" onClick={() => configure('reset')}>Restore defaults</button>
        <button type="button" onClick={() => configure('close')}>Done</button>
      </div>
    </dialog>}
  </>
}
