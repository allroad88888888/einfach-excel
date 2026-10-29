import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { borderPanelAtom, runBorderPanelAtom, editingSessionAtom, BORDER_PRESETS, BORDER_STYLES } from '@einfach-excel/spreadsheet-ui-core'
import { useId, useLayoutEffect, useRef } from 'react'
import { cycleDialogFocus } from './dialog-focus'
import { COLORS } from './color-swatches'
import './border-panel.css'

/** 选区几何不进入 React；表单只编辑三个原生命令参数。 */
export function BorderTools() {
  const { i18n, t } = useLingui()
  const lineStyles = { thin: t`Thin`, medium: t`Medium`, thick: t`Thick`,
    dashed: t`Dashed`, dotted: t`Dotted`, double: t`Double` }
  const LABELS = {
    outside: t`Outside borders`, inside: t`Inside borders`, all: t`All borders`,
    horizontal: t`Inside horizontal`, vertical: t`Inside vertical`, top: t`Top border`,
    right: t`Right border`, bottom: t`Bottom border`, left: t`Left border`, none: t`No borders`,
  }

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
      aria-label={t`Border settings`} title={t`Border settings`} disabled={editing || state.busy}
      onClick={() => void run('open')}>▾</button>
    {open && <dialog ref={dialogRef} className="border-panel" aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-hint`} onKeyDown={cycleDialogFocus}
      onCancel={(event) => { event.preventDefault(); void run('close') }}>
      <h2 id={`${id}-title`}><Trans>Borders</Trans></h2>
      <p id={`${id}-hint`}><Trans>Apply to the selected cells. Other borders and formatting stay unchanged.</Trans></p>
      <form noValidate onSubmit={(event) => { event.preventDefault(); void run('apply') }}>
        <label htmlFor={`${id}-position`}><Trans>Position</Trans></label>
        <select id={`${id}-position`} disabled={state.busy} value={state.draft.preset}
          onChange={(event) => void run({ type: 'draft', patch: {
            preset: event.currentTarget.value as typeof state.draft.preset,
          } })}>
          {BORDER_PRESETS.map((preset) => (
            <option value={preset} key={preset}>{LABELS[preset]}</option>
          ))}
        </select>
        <label htmlFor={`${id}-style`}><Trans>Line style</Trans></label>
        <select id={`${id}-style`} disabled={state.busy || state.draft.preset === 'none'} value={state.draft.style}
          onChange={(event) => void run({ type: 'draft', patch: {
            style: event.currentTarget.value as typeof state.draft.style,
          } })}>
          {BORDER_STYLES.map((style) => (
            <option key={style} value={style}>{lineStyles[style]}</option>
          ))}
        </select>
        <fieldset disabled={state.busy || state.draft.preset === 'none'}>
          <legend><Trans>Border color</Trans></legend>
          <div className="border-swatches">
            {COLORS.map((color) => <button key={color} type="button"
              aria-label={t`Border color ${color}`}
              aria-pressed={state.draft.color.toLowerCase() === color}
              style={{ backgroundColor: color }}
              onClick={() => void run({ type: 'draft', patch: { color } })} />)}
          </div>
          <div className="border-custom-color">
            <input type="color" aria-label={t`Choose custom border color`} value={validColor ? state.draft.color : '#000000'}
              onChange={(event) => void run({ type: 'draft', patch: { color: event.currentTarget.value } })} />
            <label htmlFor={`${id}-color`}><Trans>Hex color</Trans></label>
            <input id={`${id}-color`} value={state.draft.color} spellCheck={false} aria-invalid={!validColor}
              aria-describedby={state.error ? `${id}-error` : undefined}
              onChange={(event) => void run({ type: 'draft', patch: { color: event.currentTarget.value } })} />
          </div>
        </fieldset>
        <div className="border-panel-actions">
          <button type="button" disabled={state.busy} onClick={() => void run('close')}><Trans>Cancel</Trans></button>
          <button type="submit" disabled={state.busy}><Trans>Apply borders</Trans></button>
        </div>
      </form>
      {state.error && <p id={`${id}-error`} role="alert">{translateFeedback(i18n, state.error)}</p>}
      {state.busy && <p role="status"><Trans>Applying borders…</Trans></p>}
    </dialog>}
  </>
}
