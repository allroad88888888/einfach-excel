import { useAtomValue, useSetAtom } from '@einfach/react'
import { useEffect, useId, useRef } from 'react'
import { spillAvailableAtom, spillPanelAtom, runSpillAtom, coordToA1, rangeToA1 } from '@einfach/spreadsheet-ui-core'
import { cycleDialogFocus } from './dialog-focus'
import './go-to.css'

/** 原生溢出诊断只读展示；React 仅处理弹窗与焦点。 */
export function SpillTools() {
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
    <button ref={buttonRef} type="button" className="tool-button" aria-label="Spill details"
      title="Spill details" disabled={!available} onClick={() => void run('open')}>#</button>
    {state.open && <dialog ref={dialogRef} className="go-to-dialog" aria-labelledby={`${id}-title`}
      onKeyDown={cycleDialogFocus} onCancel={(event) => { event.preventDefault(); void run('close') }}>
      <h2 id={`${id}-title`}>Spill details</h2>
      {state.busy && <p role="status">Reading spill details…</p>}
      {info?.kind === 'none' && <p>This cell is not part of a spilled array.</p>}
      {info && info.kind !== 'none' && <p>Formula cell: {coordToA1(info.anchor)}</p>}
      {info?.kind === 'active' && <>
        <p>Spill range: {rangeToA1(info.range)}</p>
        <p>Size: {info.range.rowEnd - info.range.rowStart + 1} ×{' '}
          {info.range.colEnd - info.range.colStart + 1} (rows × columns)</p>
      </>}
      {info?.kind === 'blocked' && <>
        <p role="status">{info.blocker ? `Blocked by ${coordToA1(info.blocker)}.`
          : 'No blocking cell can be identified. Check worksheet limits or the array size.'}</p>
      </>}
      {info && info.kind !== 'none' && <div className="go-to-actions"
        style={{ justifyContent: 'flex-start', flexWrap: 'wrap', marginBottom: 12 }}>
        {info.kind === 'active' && <button type="button" disabled={!navigate}
          onClick={() => void run('range')}>Select spill range</button>}
        {info.kind === 'blocked' && info.blocker && <button type="button" disabled={!navigate}
          onClick={() => void run('blocker')}>Select blocking cell</button>}
        <button type="button" disabled={!navigate}
          onClick={() => void run('anchor')}>Go to formula cell</button>
      </div>}
      <p className="go-to-hint">Hidden rows and columns stay hidden. No cells are changed.</p>
      {state.stale && <p role="alert">The worksheet changed. Refresh spill details before navigating.</p>}
      {state.error && <p role="alert" className="go-to-error">{state.error}</p>}
      <div className="go-to-actions">
        <button type="button" disabled={!available} onClick={() => void run('refresh')}>Refresh</button>
        <button type="button" data-spill-close onClick={() => void run('close')}>Close</button>
      </div>
    </dialog>}
  </>
}
