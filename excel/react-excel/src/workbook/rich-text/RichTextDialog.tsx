import { useId, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui, Trans } from '@lingui/react/macro'
import {
  richTextPanelAtom,
  runRichTextAtom,
  toA1,
  type RichTextFormat,
} from '@einfach-excel/spreadsheet-ui-core'
import { cycleDialogFocus } from '../chrome/ribbon/dialog-focus'
import { translateFeedback } from '../../i18n/translate-feedback'
import './rich-text.css'

export function RichTextDialog() {
  const { t, i18n } = useLingui()
  const state = useAtomValue(richTextPanelAtom),
    run = useSetAtom(runRichTextAtom)
  const dialogRef = useRef<HTMLDialogElement>(null),
    inputRef = useRef<HTMLTextAreaElement>(null)
  const id = useId(),
    address = toA1(state.cell.row, state.cell.col)
  const selected = { ...state.base, ...state.selected }
  const color = state.selected.color ?? state.base?.fgColor ?? '#000000'
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!state.open || !dialog) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    inputRef.current?.focus()
    return () => {
      dialog.close?.()
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [state.open])
  const format = (value: RichTextFormat | null) => {
    void run({ format: value })
    inputRef.current?.focus()
    inputRef.current?.setSelectionRange(state.start, state.end)
  }
  if (!state.open) return null
  return (
    <dialog
      ref={dialogRef}
      className="rich-text-panel"
      aria-labelledby={`${id}-title`}
      onKeyDown={cycleDialogFocus}
      onCancel={(event) => {
        event.preventDefault()
        void run('close')
      }}
    >
      <h2 id={`${id}-title`}>
        <Trans>Rich text</Trans> · {address}
      </h2>
      <p>
        <Trans>Select part of the text, then apply formatting.</Trans>
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void run('save')
        }}
      >
        <fieldset disabled={state.busy}>
          <label htmlFor={`${id}-text`}>
            <Trans>Cell text</Trans>
          </label>
          <textarea
            ref={inputRef}
            id={`${id}-text`}
            value={state.text}
            rows={5}
            onSelect={(event) =>
              void run({
                selection: [event.currentTarget.selectionStart, event.currentTarget.selectionEnd],
              })
            }
            onChange={(event) =>
              void run({
                text: event.currentTarget.value,
                start: event.currentTarget.selectionStart,
                end: event.currentTarget.selectionEnd,
              })
            }
          />
          <fieldset className="rich-text-controls" disabled={state.start === state.end}>
            <legend>
              <Trans>Selected text format</Trans>
            </legend>
            {(
              [
                ['bold', t`Bold`, 'B'],
                ['italic', t`Italic`, 'I'],
                ['underline', t`Underline`, 'U̲'],
                ['strikethrough', t`Strikethrough`, 'S̶'],
              ] as const
            ).map(([key, label, icon]) => (
              <button
                key={key}
                type="button"
                aria-label={label}
                title={label}
                aria-pressed={Boolean(selected[key])}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => format({ [key]: !selected[key] })}
              >
                {icon}
              </button>
            ))}
            <label>
              <Trans>Font family</Trans>
              <select
                value={selected.fontFamily ?? ''}
                onChange={(event) => format({ fontFamily: event.currentTarget.value })}
              >
                <option value="" disabled>
                  <Trans>Default</Trans>
                </option>
                {Array.from(
                  new Set(
                    [selected.fontFamily, 'Arial', 'Calibri', 'Georgia', 'Times New Roman'].filter(
                      Boolean,
                    ),
                  ),
                ).map((family) => (
                  <option key={family} value={family}>
                    {family}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Trans>Font size</Trans>
              <input
                type="number"
                min={1}
                max={512}
                step="any"
                value={selected.fontSize ?? 12}
                onChange={(event) => {
                  const value = event.currentTarget.valueAsNumber
                  if (Number.isFinite(value) && value >= 1 && value <= 512)
                    void run({ format: { fontSize: value } })
                }}
              />
            </label>
            <label>
              <Trans>Text color</Trans>
              <input
                type="color"
                value={color}
                onChange={(event) => void run({ format: { color: event.currentTarget.value } })}
              />
            </label>
            <button type="button" onClick={() => format(null)}>
              <Trans>Reset selected formatting</Trans>
            </button>
          </fieldset>
          <label>
            <Trans>Preview</Trans>
          </label>
          <div
            className="rich-text-preview"
            style={{
              fontFamily: state.base?.fontFamily,
              fontSize: state.base?.fontSize,
              color: state.base?.fgColor,
            }}
          >
            {state.runs.map((segment, index) => {
              const f = { ...state.base, ...segment.format }
              const style: CSSProperties = {
                fontWeight: f.bold ? 700 : 400,
                fontStyle: f.italic ? 'italic' : 'normal',
                fontSize: f.fontSize,
                fontFamily: f.fontFamily,
                color: segment.format.color,
                textDecoration:
                  [f.underline && 'underline', f.strikethrough && 'line-through']
                    .filter(Boolean)
                    .join(' ') || 'none',
              }
              return (
                <span key={index} style={style}>
                  {segment.text}
                </span>
              )
            })}
          </div>
        </fieldset>
        {state.error && (
          <p role="alert" className="rich-text-error">
            {translateFeedback(i18n, state.error)}
          </p>
        )}
        {state.busy && (
          <p role="status">
            <Trans>Saving rich text…</Trans>
          </p>
        )}
        <div className="rich-text-actions">
          <button type="button" disabled={state.busy} onClick={() => void run('close')}>
            <Trans>Cancel</Trans>
          </button>
          <button type="submit" disabled={state.busy}>
            <Trans>Save changes</Trans>
          </button>
        </div>
      </form>
    </dialog>
  )
}
