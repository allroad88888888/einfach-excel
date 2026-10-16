import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useEffect, useId, useRef } from 'react'
import { spillAvailableAtom, spillPanelAtom, runSpillAtom, coordToA1, rangeToA1 } from '@einfach/spreadsheet-ui-core'
import { cycleDialogFocus } from './dialog-focus'
import './go-to.css'

/** 原生溢出诊断只读展示；React 仅处理弹窗与焦点。 */
export function SpillTools() {
  const { i18n, t } = useLingui()
  const state = useAtomValue(spillPanelAtom)
  const available = useAtomValue(spillAvailableAtom)
  const run = useSetAtom(runSpillAtom)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    const dialog = dialogRef.current
    if (!state.open || !dialog) return
    const button = buttonRef.current
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    dialog.querySelector<HTMLElement>('[data-spill-close]')?.focus()
    return () => {
      dialog.close?.()
      const grid = button?.closest('.workbook')?.querySelector<HTMLElement>('[data-workbook-grid="true"]')
      ;(grid ?? button)?.focus({ preventScroll: true })
    }
  }, [state.open])
  const info = state.inspection
  const navigate = available && !state.stale
  return <>
    <button ref={buttonRef} type="button" className="tool-button" aria-label={t`Spill details`}
      title={t`Spill details`} disabled={!available} onClick={() => void run('open')}>#</button>
    {state.open && <dialog ref={dialogRef} className="go-to-dialog" aria-labelledby={`${id}-title`}
      onKeyDown={cycleDialogFocus} onCancel={(event) => { event.preventDefault(); void run('close') }}>
      <h2 id={`${id}-title`}><Trans>Spill details</Trans></h2>
      {state.busy && <p role="status"><Trans>Reading spill details…</Trans></p>}
      {info?.kind === 'none' && <p><Trans>This cell is not part of a spilled array.</Trans></p>}
      {info && info.kind !== 'none' && <p><Trans>Formula cell: {coordToA1(info.anchor)}</Trans></p>}
      {info?.kind === 'active' && <>
        <p><Trans>Spill range: {rangeToA1(info.range)}</Trans></p>
        <p><Trans>Size: {info.range.rowEnd - info.range.rowStart + 1} ×{' '}
          {info.range.colEnd - info.range.colStart + 1} (rows × columns)</Trans></p>
      </>}
      {info?.kind === 'blocked' && <>
        <p role="status">{info.blocker ? t`Blocked by ${coordToA1(info.blocker)}.`
          : t`No blocking cell can be identified. Check worksheet limits or the array size.`}</p>
      </>}
      {info && info.kind !== 'none' && <div className="go-to-actions"
        style={{ justifyContent: 'flex-start', flexWrap: 'wrap', marginBottom: 12 }}>
        {info.kind === 'active' && <button type="button" disabled={!navigate}
          onClick={() => void run('range')}><Trans>Select spill range</Trans></button>}
        {info.kind === 'blocked' && info.blocker && <button type="button" disabled={!navigate}
          onClick={() => void run('blocker')}><Trans>Select blocking cell</Trans></button>}
        <button type="button" disabled={!navigate}
          onClick={() => void run('anchor')}><Trans>Go to formula cell</Trans></button>
      </div>}
      <p className="go-to-hint"><Trans>Hidden rows and columns stay hidden. No cells are changed.</Trans></p>
      {state.stale && <p role="alert"><Trans>The worksheet changed. Refresh spill details before navigating.</Trans></p>}
      {state.error && <p role="alert" className="go-to-error">{translateFeedback(i18n, state.error)}</p>}
      <div className="go-to-actions">
        <button type="button" disabled={!available} onClick={() => void run('refresh')}><Trans>Refresh</Trans></button>
        <button type="button" data-spill-close onClick={() => void run('close')}><Trans>Close</Trans></button>
      </div>
    </dialog>}
  </>
}
