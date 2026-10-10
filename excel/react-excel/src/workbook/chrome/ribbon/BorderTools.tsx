import { useAtomValue, useSetAtom } from '@einfach/react'
import { borderPanelAtom, runBorderPanelAtom, editingSessionAtom, BORDER_PRESETS, BORDER_STYLES } from '@einfach/spreadsheet-ui-core'
import { useId, useLayoutEffect, useRef } from 'react'
import { cycleDialogFocus } from './dialog-focus'
import { COLORS } from './color-swatches'
import './border-panel.css'

const LABELS = {
  outside: 'Outside borders', inside: 'Inside borders', all: 'All borders',
  horizontal: 'Inside horizontal', vertical: 'Inside vertical', top: 'Top border',
  right: 'Right border', bottom: 'Bottom border', left: 'Left border', none: 'No borders',
}

/** 选区几何不进入 React；表单只编辑三个原生命令参数。 */
export function BorderTools() {
  const state = useAtomValue(borderPanelAtom)
  const run = useSetAtom(runBorderPanelAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const trigger = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()
  const open = state.target !== null
  const validColor = /^#[\da-f]{6}$/i.test(state.draft.color)
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const opener = trigger.current
    if (!open || !dialog) return
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    dialog.querySelector('select')?.focus()
    return () => { dialog.close?.(); opener?.focus({ preventScroll: true }) }
  }, [open])
  return <>
    <button ref={trigger} className="tool-button tool-dropdown-button" type="button"
      aria-label="Border settings" title="Border settings" disabled={editing || state.busy}
      onClick={() => void run('open')}>▾</button>
    {open && <dialog ref={dialogRef} className="border-panel" aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-hint`} onKeyDown={cycleDialogFocus}
      onCancel={(event) => { event.preventDefault(); void run('close') }}>
      <h2 id={`${id}-title`}>Borders</h2>
      <p id={`${id}-hint`}>Apply to the selected cells. Other borders and formatting stay unchanged.</p>
      <form noValidate onSubmit={(event) => { event.preventDefault(); void run('apply') }}>
        <label htmlFor={`${id}-position`}>Position</label>
        <select id={`${id}-position`} disabled={state.busy} value={state.draft.preset}
          onChange={(event) => void run({ type: 'draft', patch: {
            preset: event.currentTarget.value as typeof state.draft.preset,
          } })}>
          {BORDER_PRESETS.map((preset) => (
            <option value={preset} key={preset}>{LABELS[preset]}</option>
          ))}
        </select>
        <label htmlFor={`${id}-style`}>Line style</label>
        <select id={`${id}-style`} disabled={state.busy || state.draft.preset === 'none'} value={state.draft.style}
          onChange={(event) => void run({ type: 'draft', patch: {
            style: event.currentTarget.value as typeof state.draft.style,
          } })}>
          {BORDER_STYLES.map((style) => (
            <option key={style} value={style}>{style[0].toUpperCase() + style.slice(1)}</option>
          ))}
        </select>
        <fieldset disabled={state.busy || state.draft.preset === 'none'}>
          <legend>Border color</legend>
          <div className="border-swatches">
            {COLORS.map((color) => <button key={color} type="button"
              aria-label={`Border color ${color}`}
              aria-pressed={state.draft.color.toLowerCase() === color}
              style={{ backgroundColor: color }}
              onClick={() => void run({ type: 'draft', patch: { color } })} />)}
          </div>
          <div className="border-custom-color">
            <input type="color" aria-label="Choose custom border color" value={validColor ? state.draft.color : '#000000'}
              onChange={(event) => void run({ type: 'draft', patch: { color: event.currentTarget.value } })} />
            <label htmlFor={`${id}-color`}>Hex color</label>
            <input id={`${id}-color`} value={state.draft.color} spellCheck={false} aria-invalid={!validColor}
              aria-describedby={state.error ? `${id}-error` : undefined}
              onChange={(event) => void run({ type: 'draft', patch: { color: event.currentTarget.value } })} />
          </div>
        </fieldset>
        <div className="border-panel-actions">
          <button type="button" disabled={state.busy} onClick={() => void run('close')}>Cancel</button>
          <button type="submit" disabled={state.busy}>Apply borders</button>
        </div>
      </form>
      {state.error && <p id={`${id}-error`} role="alert">{state.error}</p>}
      {state.busy && <p role="status">Applying borders…</p>}
    </dialog>}
  </>
}
