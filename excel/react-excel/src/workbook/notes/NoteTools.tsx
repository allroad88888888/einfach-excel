import { useId, useLayoutEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui, Trans } from '@lingui/react/macro'
import { notePanelAtom, runNoteAtom, NOTE_MAX_CHARACTERS, toA1 } from '@einfach/spreadsheet-ui-core'
import { cycleDialogFocus } from '../chrome/ribbon/dialog-focus'
import { translateFeedback } from '../../i18n/translate-feedback'
import './notes.css'

/** 备注正文保存在 Rust；React 只渲染 Core 草稿并处理 DOM 焦点。 */
export function NoteTools(): React.JSX.Element {
  const { t, i18n } = useLingui()
  const state = useAtomValue(notePanelAtom)
  const run = useSetAtom(runNoteAtom)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()
  const address = toA1(state.cell.row, state.cell.col)
  useLayoutEffect(() => {
    const node = dialog.current
    const opener = trigger.current
    if (!state.open || !node) return
    if (node.showModal) node.showModal()
    else node.setAttribute('open', '')
    return () => { node.close?.(); if (opener?.isConnected) opener.focus({ preventScroll: true }) }
  }, [state.open])
  useLayoutEffect(() => {
    if (state.open && state.loaded && !state.phase) dialog.current?.querySelector('textarea')?.focus()
  }, [state.open, state.loaded, state.phase])
  return (
    <>
      <button
        ref={trigger}
        className="tool-button"
        type="button"
        aria-label={t`Note`}
        title={t`Note`}
        disabled={!state.available || state.busy}
        onClick={() => void run('open')}
      >
        <span aria-hidden="true">▧</span>
      </button>
      {state.open && (
        <dialog
          ref={dialog}
          className="note-panel"
          aria-labelledby={`${id}-title`}
          aria-busy={state.busy}
          onKeyDown={cycleDialogFocus}
          onCancel={(event) => {
            event.preventDefault()
            void run('close')
          }}
        >
          <h2 id={`${id}-title`}>{state.existing ? t`Edit note` : t`Insert note`}</h2>
          <p>
            <Trans>Note for cell {address}</Trans>
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void run('save')
            }}
          >
            <label htmlFor={`${id}-text`}>
              <Trans>Note text</Trans>
            </label>
            <textarea
              id={`${id}-text`}
              rows={7}
              value={state.text}
              disabled={state.busy || !state.loaded}
              aria-describedby={`${id}-hint`}
              onChange={(event) => void run({ text: event.currentTarget.value })}
            />
            <p id={`${id}-hint`} className="note-hint">
              <Trans>
                Plain text, up to {NOTE_MAX_CHARACTERS} characters. Use Delete note to remove it.
              </Trans>
              <span className="note-count">
                {Array.from(state.text).length} / {NOTE_MAX_CHARACTERS}
              </span>
            </p>
            {state.error && (
              <p className="note-error" role="alert">
                {translateFeedback(i18n, state.error)}
              </p>
            )}
            {state.phase === 'loading' && (
              <p role="status">
                <Trans>Loading note…</Trans>
              </p>
            )}
            {state.phase === 'saving' && (
              <p role="status">
                <Trans>Saving note…</Trans>
              </p>
            )}
            <div className="note-actions">
              <button
                type="button"
                disabled={state.busy || !state.existing}
                onClick={() => void run('remove')}
              >
                <Trans>Delete note</Trans>
              </button>
              <button
                type="button"
                disabled={state.phase === 'saving'}
                onClick={() => void run('close')}
              >
                <Trans>Cancel</Trans>
              </button>
              <button type="submit" disabled={state.busy || !state.loaded}>
                {state.existing ? t`Save note` : t`Insert note`}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  )
}
