import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeCellFormatAtom, colorPaletteAtom, editingSessionAtom,
  runColorPaletteAtom, toolbarActiveSurfaceAtom, type ToolbarPaletteKind,
} from '@einfach/spreadsheet-ui-core'
import { useId, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { cycleDialogFocus } from './dialog-focus'
import { COLORS } from './color-swatches'
import './color-palette.css'

/** 填充/文字色共用一个视图；传入的 kind 只是工具类型，不传控制器或业务状态。 */
export function ColorTools({ kind }: { readonly kind: ToolbarPaletteKind }) {
  const { i18n, t } = useLingui()
  const state = useAtomValue(colorPaletteAtom)
  const surface = useAtomValue(toolbarActiveSurfaceAtom)
  const format = useAtomValue(activeCellFormatAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const run = useSetAtom(runColorPaletteAtom)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()
  const open = surface?.kind === 'palette' && surface.id === kind
  const fill = kind === 'fill-color'
  const label = fill ? t`Fill color` : t`Text color`
  const current = fill ? format.bgColor : format.fgColor
  const last = state.last[kind]
  const validDraft = /^#[\da-f]{6}$/i.test(state.draft)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const button = trigger.current
    if (!open || !dialog || !button) return
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    const position = () => {
      const rect = button.getBoundingClientRect()
      dialog.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - dialog.offsetWidth - 8))}px`
      dialog.style.top = `${Math.max(8, Math.min(rect.bottom + 6, innerHeight - dialog.offsetHeight - 8))}px`
    }
    position()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(position)
    observer?.observe(dialog)
    window.addEventListener('resize', position)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', position)
      dialog.close?.()
      button.focus({ preventScroll: true })
    }
  }, [open])

  return <>
    <span className="color-tool">
      <button type="button" className="tool-button color-apply" aria-label={label}
        title={`${label}: ${last}`} disabled={editing || state.busy}
        aria-pressed={current?.toLowerCase() === last}
        style={{ '--swatch': last } as CSSProperties}
        onClick={() => void run({ type: 'quick', kind })}>
        <span aria-hidden="true">{fill ? '▰' : 'A'}</span>
      </button>
      <button ref={trigger} type="button" className="tool-button color-open"
        aria-label={t`Choose ${label.toLowerCase()}`} title={t`Choose ${label.toLowerCase()}`}
        aria-haspopup="dialog" aria-expanded={open} disabled={editing || state.busy}
        onClick={() => void run({ type: 'open', kind })}>⌄</button>
    </span>
    {open && <dialog ref={dialogRef} className="color-palette" aria-labelledby={`${id}-title`}
      onKeyDown={cycleDialogFocus}
      onCancel={(event) => { event.preventDefault(); void run('close') }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right ||
          event.clientY < rect.top || event.clientY > rect.bottom) void run('close')
      }}>
      <header><h2 id={`${id}-title`}>{label}</h2>
        <button type="button" aria-label={t`Close color palette`} disabled={state.busy}
          onClick={() => void run('close')}>×</button></header>
      <button className="color-reset" type="button" disabled={state.busy}
        onClick={() => void run({ type: 'choose', value: null })}>
        {fill ? t`No fill` : t`Automatic text color`}
      </button>
      <div className="color-swatches" role="group" aria-label={t`Standard colors`}>
        {COLORS.map((color) => <button key={color} type="button" title={color}
          aria-label={t`Color ${color}`} aria-pressed={current?.toLowerCase() === color}
          disabled={state.busy} style={{ backgroundColor: color }}
          onClick={() => void run({ type: 'choose', value: color })}>
          {current?.toLowerCase() === color && <span aria-hidden="true">✓</span>}
        </button>)}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); void run('apply') }}>
        <label htmlFor={`${id}-hex`}><Trans>Custom color</Trans></label>
        <div className="color-custom">
          <input type="color" aria-label={t`Custom color picker`} disabled={state.busy}
            value={validDraft ? state.draft.toLowerCase() : last}
            onChange={(event) => void run({ type: 'draft', value: event.currentTarget.value })} />
          <input id={`${id}-hex`} type="text" aria-label={t`Color hex`} spellCheck={false}
            value={state.draft} disabled={state.busy} maxLength={7}
            aria-invalid={!!state.error && !validDraft}
            aria-describedby={state.error ? `${id}-error` : undefined}
            onChange={(event) => void run({ type: 'draft', value: event.currentTarget.value })} />
          <button type="submit" disabled={state.busy}><Trans>Apply</Trans></button>
        </div>
      </form>
      {state.error && <p id={`${id}-error`} role="alert">{translateFeedback(i18n, state.error)}</p>}
      {state.busy && <p role="status"><Trans>Applying color…</Trans></p>}
    </dialog>}
  </>
}
