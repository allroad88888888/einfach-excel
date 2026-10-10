import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeCellFormatAtom, DEFAULT_FONT_SIZE, editingSessionAtom, FONT_SIZE_PRESETS,
  fontSizePanelAtom, runFontSizeAtom,
} from '@einfach/spreadsheet-ui-core'
import { useId, useLayoutEffect, useRef } from 'react'
import { cycleDialogFocus } from './dialog-focus'
import { preserveToolFocus } from './tool-focus'
import './font-size.css'

/** 预设/自定义/增减共享字号命令；这里只处理表单和焦点。 */
export function FontSizeTools() {
  const format = useAtomValue(activeCellFormatAtom)
  const state = useAtomValue(fontSizePanelAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const run = useSetAtom(runFontSizeAtom)
  const size = format.fontSize ?? DEFAULT_FONT_SIZE
  const disabled = editing || state.busy
  const select = useRef<HTMLSelectElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()
  const open = state.witness !== null
  const draftSize = Number(state.draft)
  const validDraft = Number.isInteger(draftSize) && draftSize >= 1 && draftSize <= 512
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const trigger = select.current
    if (!open || !dialog) return
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    dialog.querySelector('input')?.select()
    return () => {
      dialog.close?.()
      trigger?.focus({ preventScroll: true })
    }
  }, [open])
  return <>
    <select ref={select} aria-label="Font size" title="Font size (pixels)"
      className="tool-select font-size-select" value={size} disabled={disabled}
      onChange={(event) => void preserveToolFocus(event.currentTarget, () => run(
        event.currentTarget.value === 'custom' ? 'open'
          : { type: 'set', value: Number(event.currentTarget.value) }))}>
      {FONT_SIZE_PRESETS.map((value) => <option key={value} value={value}>{value}</option>)}
      {!FONT_SIZE_PRESETS.some((value) => value === size) && <option value={size}>{size}</option>}
      <option value="custom">Custom…</option>
    </select>
    <button type="button" className="tool-button" aria-label="Increase font size"
      title="Increase font size" disabled={disabled || size >= 512}
      onClick={(event) => void preserveToolFocus(event.currentTarget, () => run('increase'))}>A+</button>
    <button type="button" className="tool-button" aria-label="Decrease font size"
      title="Decrease font size" disabled={disabled || size <= 1}
      onClick={(event) => void preserveToolFocus(event.currentTarget, () => run('decrease'))}>A−</button>
    {!open && state.busy && <span role="status">Applying font size…</span>}
    {open && <dialog ref={dialogRef} className="font-size-dialog" aria-labelledby={`${id}-title`}
      onKeyDown={cycleDialogFocus}
      onCancel={(event) => { event.preventDefault(); void run('close') }}>
      <h2 id={`${id}-title`}>Custom font size</h2>
      <p id={`${id}-hint`}>Apply an integer size from 1 to 512 pixels to the selected cells.</p>
      <form noValidate onSubmit={(event) => { event.preventDefault(); void run('apply') }}>
        <label htmlFor={`${id}-size`}>Size (px)</label>
        <input id={`${id}-size`} type="number" min="1" max="512" step="1"
          aria-label="Custom font size" aria-invalid={!!state.error && !validDraft}
          aria-describedby={state.error ? `${id}-error` : `${id}-hint`}
          value={state.draft} disabled={state.busy}
          onChange={(event) => void run({ type: 'draft', value: event.currentTarget.value })} />
        <div className="font-size-actions">
          <button type="button" disabled={state.busy} onClick={() => void run('close')}>Cancel</button>
          <button type="submit" disabled={state.busy}>Apply font size</button>
        </div>
      </form>
      {state.error && <p id={`${id}-error`} role="alert">{state.error}</p>}
      {state.busy && <p role="status">Applying font size…</p>}
    </dialog>}
  </>
}
