import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  editingSessionAtom,
  runSelectionSizeAtom,
  selectionSizePanelAtom,
} from '@einfach/spreadsheet-ui-core'
import { useEffect, useId, useRef } from 'react'
import { cycleDialogFocus } from './dialog-focus'
import './selection-size.css'

/** DOM 模态框只负责输入与焦点；选区目标、草稿、异步结果由 command atom 管理。 */
export function SelectionSizeTools() {
  const { i18n, t } = useLingui()
  const state = useAtomValue(selectionSizePanelAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const run = useSetAtom(runSelectionSizeAtom)
  const ref = useRef<HTMLDialogElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const id = useId()
  const target = state.target
  useEffect(() => {
    const dialog = ref.current
    if (!dialog || !target) return
    const button = buttonRef.current
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => {
      dialog.close?.()
      button?.focus({ preventScroll: true })
    }
  }, [target])
  return (
    <>
      <button
        ref={buttonRef}
        className="tool-button"
        aria-label={t`Row and column size`}
        title={t`Row and column size`}
        disabled={editing || state.busy}
        type="button"
        onClick={() => void run('open')}
      >
        ↔
      </button>
      {!target && state.error && <span role="alert" className="size-error">{translateFeedback(i18n, state.error)}</span>}
      {!target && state.busy && <span role="status"><Trans>Saving sizes…</Trans></span>}
      {target && (
        <dialog
          ref={ref}
          className="selection-size-dialog"
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-description`}
          onKeyDown={cycleDialogFocus}
          onCancel={(event) => {
            event.preventDefault()
            void run('close')
          }}
        >
          <h2 id={`${id}-title`}><Trans>Row and column size</Trans></h2>
          <p id={`${id}-description`}><Trans>
            Applies to rows {target.range.rowStart + 1}–{target.range.rowEnd + 1} and columns{' '}
            {target.range.colStart + 1}–{target.range.colEnd + 1}. Sizes are in pixels.
          </Trans></p>
          {(['height', 'width'] as const).map((field) => (
            <form
              key={field}
              onSubmit={(event) => {
                event.preventDefault()
                void run(field === 'height' ? 'row' : 'column')
              }}
            >
              <label htmlFor={`${id}-${field}`}>
                {field === 'height' ? t`Row height` : t`Column width`}
              </label>
              <input
                id={`${id}-${field}`}
                type="number"
                step="1"
                min={field === 'height' ? 16 : 40}
                max={field === 'height' ? 512 : 1024}
                required
                disabled={state.busy}
                value={state[field]}
                onChange={(event) => void run({ field, value: event.currentTarget.value })}
              />
              <button type="submit" disabled={state.busy}>
                {field === 'height' ? t`Set row height` : t`Set column width`}
              </button>
            </form>
          ))}
          {state.error && (
            <p role="alert" className="size-error">
              {translateFeedback(i18n, state.error)}
            </p>
          )}
          <div className="size-actions">
            <button type="button" disabled={state.busy} onClick={() => void run('reset')}><Trans>
              Reset selected sizes
            </Trans></button>
            <button type="button" disabled={state.busy} onClick={() => void run('close')}><Trans>
              Cancel
            </Trans></button>
          </div>
          <p className="size-hint"><Trans>
            Reset sizes keeps cell values and formatting. It does not auto-fit text.
          </Trans></p>
          {state.busy && <p role="status"><Trans>Saving sizes…</Trans></p>}
        </dialog>
      )}
    </>
  )
}
