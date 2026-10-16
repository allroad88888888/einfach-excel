import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useEffect, useId, useRef } from 'react'
import {
  coordToA1,
  editingSessionAtom,
  findReplacePanelAtom,
  runFindReplaceAtom,
  workbookDocumentAtom,
} from '@einfach/spreadsheet-ui-core'
import './find-replace.css'
import { FindResults } from './FindResults'
import { cycleDialogFocus } from './dialog-focus'

/** 只处理 DOM 控件与焦点；草稿、查询、替换、导航由同一个 command atom 执行。 */
export function FindReplaceTools() {
  const { i18n, t } = useLingui()
  const state = useAtomValue(findReplacePanelAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const workbook = useAtomValue(workbookDocumentAtom)
  const run = useSetAtom(runFindReplaceAtom)
  const ref = useRef<HTMLDialogElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!state.open || !dialog) return
    const button = buttonRef.current
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    inputRef.current?.focus()
    inputRef.current?.select()
    return () => {
      dialog.close?.()
      const grid = button
        ?.closest('.workbook')
        ?.querySelector<HTMLElement>('[data-workbook-grid="true"]')
      ;(grid ?? button)?.focus({ preventScroll: true })
    }
  }, [state.open])
  const { form, result } = state
  const busy = state.busy !== null
  const match = result?.current
  const matchSheet = workbook.sheets.find((sheet) => sheet.id === match?.sheetId)
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="tool-button"
        aria-label={t`Find and replace`}
        title={t`Find and replace (Ctrl/⌘+F)`}
        disabled={editing || busy}
        onClick={() => void run({ open: 'find' })}
      >
        ⌕
      </button>
      {state.open && (
        <dialog
          ref={ref}
          className="find-replace-dialog"
          aria-labelledby={`${id}-title`}
          onKeyDown={cycleDialogFocus}
          onCancel={(event) => {
            event.preventDefault()
            void run('close')
          }}
        >
          <h2 id={`${id}-title`}><Trans>Find and replace</Trans></h2>
          <div
            className="find-tabs"
            role="tablist"
            aria-label={t`Find or replace`}
            onKeyDown={(event) => {
              if (busy || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              event.stopPropagation()
              const tab =
                event.key === 'Home'
                  ? 'find'
                  : event.key === 'End'
                    ? 'replace'
                    : state.tab === 'find'
                      ? 'replace'
                      : 'find'
              void run({ open: tab })
              event.currentTarget.querySelector<HTMLElement>(`[data-find-tab="${tab}"]`)?.focus()
            }}
          >
            {(['find', 'replace'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`${id}-${tab}`}
                data-find-tab={tab}
                aria-controls={`${id}-panel`}
                aria-selected={state.tab === tab}
                tabIndex={state.tab === tab ? 0 : -1}
                disabled={busy}
                onClick={() => void run({ open: tab })}
              >
                {tab === 'find' ? t`Find` : t`Replace`}
              </button>
            ))}
          </div>
          <form
            id={`${id}-panel`}
            role="tabpanel"
            aria-labelledby={`${id}-${state.tab}`}
            onSubmit={(event) => {
              event.preventDefault()
              void run('next')
            }}
          >
            <label htmlFor={`${id}-needle`}><Trans>Find what</Trans></label>
            <input
              ref={inputRef}
              id={`${id}-needle`}
              value={form.needle}
              disabled={state.busy === 'replace'}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => void run({ form: { needle: event.currentTarget.value } })}
            />
            {state.tab === 'replace' && (
              <>
                <label htmlFor={`${id}-replacement`}><Trans>Replace with</Trans></label>
                <input
                  id={`${id}-replacement`}
                  value={form.replacement}
                  disabled={state.busy === 'replace'}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) =>
                    void run({ form: { replacement: event.currentTarget.value } })
                  }
                />
              </>
            )}
            <div className="find-options">
              <label><Trans>
                Within
                </Trans><select
                  value={form.scope}
                  disabled={busy}
                  onChange={(event) =>
                    void run({
                      form: {
                        scope: event.currentTarget.value as typeof form.scope,
                      },
                    })
                  }
                >
                  <option value="sheet"><Trans>Current sheet</Trans></option>
                  <option value="workbook"><Trans>Workbook</Trans></option>
                  <option value="current-selection"><Trans>Original selection</Trans></option>
                </select>
              </label>
              <label><Trans>
                Look in
                </Trans><select
                  value={form.lookIn}
                  disabled={busy}
                  onChange={(event) =>
                    void run({
                      form: {
                        lookIn: event.currentTarget.value as typeof form.lookIn,
                      },
                    })
                  }
                >
                  <option value="formulas"><Trans>Formulas / raw values</Trans></option>
                  <option value="values"><Trans>Displayed values</Trans></option>
                </select>
              </label>
            </div>
            <div className="find-checks">
              <label>
                <input
                  type="checkbox"
                  checked={form.wildcards ?? false}
                  disabled={busy}
                  onChange={(event) =>
                    void run({ form: { wildcards: event.currentTarget.checked } })
                  }
                /><Trans>
                Use wildcards
              </Trans></label>
              <label>
                <input
                  type="checkbox"
                  checked={form.caseSensitive}
                  disabled={busy}
                  onChange={(event) =>
                    void run({ form: { caseSensitive: event.currentTarget.checked } })
                  }
                /><Trans>
                Match case
              </Trans></label>
              <label>
                <input
                  type="checkbox"
                  checked={form.wholeCell}
                  disabled={busy}
                  onChange={(event) =>
                    void run({ form: { wholeCell: event.currentTarget.checked } })
                  }
                /><Trans>
                Match entire cell
              </Trans></label>
            </div>
            {match && (
              <p className="find-match" role="status"><Trans>
                {result!.index + 1} of {result!.total} · {matchSheet?.name}!{coordToA1(match)}
              </Trans></p>
            )}
            {state.notice && <p role="status">{translateFeedback(i18n, state.notice)}</p>}
            {state.error && (
              <p role="alert" className="find-error">
                {translateFeedback(i18n, state.error)}
              </p>
            )}
            {busy && <p role="status">{state.busy === 'find' ? t`Finding…` : t`Replacing…`}</p>}
            <div className="find-actions">
              <button type="button" disabled={busy || !match} onClick={() => void run('previous')}><Trans>
                Previous
              </Trans></button>
              <button type="submit" className="find-primary" disabled={busy || !form.needle}><Trans>
                Find next
              </Trans></button>
              <button
                type="button"
                disabled={busy || !form.needle}
                onClick={() => void run('find-all')}
              ><Trans>
                Find all
              </Trans></button>
              {state.tab === 'replace' && (
                <>
                  <button
                    type="button"
                    disabled={busy || !match}
                    onClick={() => void run('replace-current')}
                  ><Trans>
                    Replace current
                  </Trans></button>
                  <button
                    type="button"
                    disabled={busy || !form.needle}
                    onClick={() => void run('replace-all')}
                  ><Trans>
                    Replace all
                  </Trans></button>
                </>
              )}
              <button
                type="button"
                disabled={state.busy === 'replace'}
                onClick={() => void run('close')}
              ><Trans>
                Close
              </Trans></button>
            </div>
          </form>
          <FindResults />
          <p className="find-hint">
            {form.wildcards
              ? t`* = any text, ? = one character, ~ escapes *, ? or ~. `
              : t`Searches literal text, including offscreen cells. `}<Trans>
            Replacements can be undone together.
          </Trans></p>
          {form.lookIn === 'values' && state.tab === 'replace' && (
            <p className="find-hint"><Trans>
              To replace a formula, choose Formulas / raw values. Calculated results are not
              overwritten.
            </Trans></p>
          )}
        </dialog>
      )}
    </>
  )
}
