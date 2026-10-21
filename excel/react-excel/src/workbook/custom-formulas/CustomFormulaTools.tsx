import { useId, useLayoutEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { Trans, useLingui } from '@lingui/react/macro'
import { customFormulaPanelAtom, runCustomFormulaAtom } from '@einfach/spreadsheet-ui-core'
import { cycleDialogFocus } from '../chrome/ribbon/dialog-focus'
import { translateFeedback } from '../../i18n/translate-feedback'
import './custom-formulas.css'

/** The dialog renders Core drafts; expression evaluation stays in Rust. */
export function CustomFormulaTools(): React.JSX.Element {
  const { t, i18n } = useLingui()
  const state = useAtomValue(customFormulaPanelAtom)
  const run = useSetAtom(runCustomFormulaAtom)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const name = useRef<HTMLInputElement>(null)
  const id = useId()
  useLayoutEffect(() => {
    const node = dialog.current
    const opener = trigger.current
    if (!state.open || !node) return
    if (node.showModal) node.showModal()
    else node.setAttribute('open', '')
    return () => { node.close?.(); if (opener?.isConnected) opener.focus({ preventScroll: true }) }
  }, [state.open])
  useLayoutEffect(() => {
    if (state.open && state.loaded && !state.phase) name.current?.focus()
  }, [state.open, state.loaded, state.phase])
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="tool-button"
        aria-label={t`Custom formulas`}
        title={t`Custom formulas`}
        disabled={!state.available || state.busy}
        onClick={() => void run('open')}
      >
        <span aria-hidden="true">ƒ+</span>
      </button>
      {state.open && (
        <dialog
          ref={dialog}
          className="custom-formula-panel"
          aria-labelledby={`${id}-title`}
          aria-busy={state.busy}
          onKeyDown={cycleDialogFocus}
          onCancel={(event) => {
            event.preventDefault()
            void run('close')
          }}
        >
          <h2 id={`${id}-title`}>
            <Trans>Custom formulas</Trans>
          </h2>
          <p className="custom-formula-hint">
            <Trans>Define a formula once, then call it in any sheet.</Trans>
          </p>
          <div className="custom-formula-library">
            <label htmlFor={`${id}-saved`}>
              <Trans>Saved formula</Trans>
            </label>
            <select
              id={`${id}-saved`}
              value={state.selected}
              disabled={state.busy || !state.loaded}
              onChange={(event) =>
                void run(event.currentTarget.value ? { select: event.currentTarget.value } : 'new')
              }
            >
              <option value="">{t`New formula`}</option>
              {state.definitions.map((definition) => (
                <option key={definition.name} value={definition.name}>
                  {definition.name}({definition.parameters.join(', ')})
                </option>
              ))}
            </select>
            {state.loaded && state.definitions.length === 0 && (
              <p className="custom-formula-hint">
                <Trans>No custom formulas yet.</Trans>
              </p>
            )}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void run('save')
            }}
          >
            <label htmlFor={`${id}-name`}>
              <Trans>Function name</Trans>
            </label>
            <input
              ref={name}
              id={`${id}-name`}
              value={state.name}
              readOnly={Boolean(state.selected)}
              disabled={state.busy || !state.loaded}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => void run({ draft: { name: event.currentTarget.value } })}
            />
            <label htmlFor={`${id}-parameters`}>
              <Trans>Parameters, separated by commas</Trans>
            </label>
            <input
              id={`${id}-parameters`}
              value={state.parameters}
              disabled={state.busy || !state.loaded}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => void run({ draft: { parameters: event.currentTarget.value } })}
            />
            <label htmlFor={`${id}-expression`}>
              <Trans>Formula expression</Trans>
            </label>
            <textarea
              id={`${id}-expression`}
              rows={4}
              value={state.expression}
              spellCheck={false}
              disabled={state.busy || !state.loaded}
              aria-describedby={`${id}-hint`}
              onChange={(event) => void run({ draft: { expression: event.currentTarget.value } })}
            />
            <p id={`${id}-hint`} className="custom-formula-hint">
              <Trans>
                Example: DOUBLE with parameter amount and expression =amount*2. Pass cells and
                ranges as arguments. Every parameter is required.
              </Trans>
            </p>
            {state.error && (
              <p role="alert" className="custom-formula-error">
                {translateFeedback(i18n, state.error)}
              </p>
            )}
            {state.phase === 'reading' && (
              <p role="status">
                <Trans>Loading custom formulas…</Trans>
              </p>
            )}
            {state.phase === 'saving' && (
              <p role="status">
                <Trans>Saving custom formula…</Trans>
              </p>
            )}
            <div className="custom-formula-actions">
              <button
                type="button"
                disabled={state.busy || !state.selected}
                onClick={() => void run('remove')}
              >
                <Trans>Remove formula</Trans>
              </button>
              <button
                type="button"
                disabled={state.phase === 'saving'}
                onClick={() => void run('close')}
              >
                <Trans>Cancel</Trans>
              </button>
              <button type="submit" disabled={state.busy || !state.loaded}>
                {state.selected ? t`Replace formula` : t`Register formula`}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  )
}
