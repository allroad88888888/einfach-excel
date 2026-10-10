import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeCellFormatAtom, colorPaletteAtom, editingSessionAtom,
  runColorPaletteAtom, toolbarActiveSurfaceAtom, type ToolbarPaletteKind,
} from '@einfach/spreadsheet-ui-core'
import { useId, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { cycleDialogFocus } from './dialog-focus'
import './color-palette.css'

const COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#cccccc', '#efefef', '#ffffff', '#c00000',
  '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6fa8dc', '#8e7cc3', '#c27ba0',
  '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#cfe2f3', '#d9d2e9', '#ead1dc',
]

/** 填充/文字色共用一个视图；传入的 kind 只是工具类型，不传控制器或业务状态。 */
export function ColorTools({ kind }: { readonly kind: ToolbarPaletteKind }) {
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
  const label = fill ? 'Fill color' : 'Text color'
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
        aria-label={`Choose ${label.toLowerCase()}`} title={`Choose ${label.toLowerCase()}`}
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
        <button type="button" aria-label="Close color palette" disabled={state.busy}
          onClick={() => void run('close')}>×</button></header>
      <button className="color-reset" type="button" disabled={state.busy}
        onClick={() => void run({ type: 'choose', value: null })}>
        {fill ? 'No fill' : 'Automatic text color'}
      </button>
      <div className="color-swatches" role="group" aria-label="Standard colors">
        {COLORS.map((color) => <button key={color} type="button" title={color}
          aria-label={`Color ${color}`} aria-pressed={current?.toLowerCase() === color}
          disabled={state.busy} style={{ backgroundColor: color }}
          onClick={() => void run({ type: 'choose', value: color })}>
          {current?.toLowerCase() === color && <span aria-hidden="true">✓</span>}
        </button>)}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); void run('apply') }}>
        <label htmlFor={`${id}-hex`}>Custom color</label>
        <div className="color-custom">
          <input type="color" aria-label="Custom color picker" disabled={state.busy}
            value={validDraft ? state.draft.toLowerCase() : last}
            onChange={(event) => void run({ type: 'draft', value: event.currentTarget.value })} />
          <input id={`${id}-hex`} type="text" aria-label="Color hex" spellCheck={false}
            value={state.draft} disabled={state.busy} maxLength={7}
            aria-invalid={!!state.error && !validDraft}
            aria-describedby={state.error ? `${id}-error` : undefined}
            onChange={(event) => void run({ type: 'draft', value: event.currentTarget.value })} />
          <button type="submit" disabled={state.busy}>Apply</button>
        </div>
      </form>
      {state.error && <p id={`${id}-error`} role="alert">{state.error}</p>}
      {state.busy && <p role="status">Applying color…</p>}
    </dialog>}
  </>
}
