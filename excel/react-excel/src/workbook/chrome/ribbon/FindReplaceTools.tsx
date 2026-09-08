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

/** 只处理 DOM 控件与焦点；草稿、查询、替换、导航由同一个 command atom 执行。 */
export function FindReplaceTools() {
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
        aria-label="Find and replace"
        title="Find and replace (Ctrl/⌘+F)"
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
          onKeyDown={(event) => {
            if (event.key !== 'Tab') return
            // 在首尾控件间循环，避免浏览器把 Tab 焦点送到地址栏。
            const controls = event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), select:not(:disabled)',
            )
            const first = controls[0]
            const last = controls[controls.length - 1]
            if (event.shiftKey ? event.target !== first : event.target !== last) return
            event.preventDefault()
            ;(event.shiftKey ? last : first)?.focus()
          }}
          onCancel={(event) => {
            event.preventDefault()
            void run('close')
          }}
        >
          <h2 id={`${id}-title`}>Find and replace</h2>
          <div
            className="find-tabs"
            role="tablist"
            aria-label="Find or replace"
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
                {tab === 'find' ? 'Find' : 'Replace'}
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
            <label htmlFor={`${id}-needle`}>Find what</label>
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
                <label htmlFor={`${id}-replacement`}>Replace with</label>
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
              <label>
                Within
                <select
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
                  <option value="sheet">Current sheet</option>
                  <option value="workbook">Workbook</option>
                  <option value="current-selection">Original selection</option>
                </select>
              </label>
              <label>
                Look in
                <select
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
                  <option value="formulas">Formulas / raw values</option>
                  <option value="values">Displayed values</option>
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
                />
                Use wildcards
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.caseSensitive}
                  disabled={busy}
                  onChange={(event) =>
                    void run({ form: { caseSensitive: event.currentTarget.checked } })
                  }
                />
                Match case
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.wholeCell}
                  disabled={busy}
                  onChange={(event) =>
                    void run({ form: { wholeCell: event.currentTarget.checked } })
                  }
                />
                Match entire cell
              </label>
            </div>
            {match && (
              <p className="find-match" role="status">
                {result!.index + 1} of {result!.total} · {matchSheet?.name}!{coordToA1(match)}
              </p>
            )}
            {state.notice && <p role="status">{state.notice}</p>}
            {state.error && (
              <p role="alert" className="find-error">
                {state.error}
              </p>
            )}
            {busy && <p role="status">{state.busy === 'find' ? 'Finding…' : 'Replacing…'}</p>}
            <div className="find-actions">
              <button type="button" disabled={busy || !match} onClick={() => void run('previous')}>
                Previous
              </button>
              <button type="submit" className="find-primary" disabled={busy || !form.needle}>
                Find next
              </button>
              <button
                type="button"
                disabled={busy || !form.needle}
                onClick={() => void run('find-all')}
              >
                Find all
              </button>
              {state.tab === 'replace' && (
                <>
                  <button
                    type="button"
                    disabled={busy || !match}
                    onClick={() => void run('replace-current')}
                  >
                    Replace current
                  </button>
                  <button
                    type="button"
                    disabled={busy || !form.needle}
                    onClick={() => void run('replace-all')}
                  >
                    Replace all
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={state.busy === 'replace'}
                onClick={() => void run('close')}
              >
                Close
              </button>
            </div>
          </form>
          <FindResults />
          <p className="find-hint">
            {form.wildcards
              ? '* = any text, ? = one character, ~ escapes *, ? or ~. '
              : 'Searches literal text, including offscreen cells. '}
            Replacements can be undone together.
          </p>
          {form.lookIn === 'values' && state.tab === 'replace' && (
            <p className="find-hint">
              To replace a formula, choose Formulas / raw values. Calculated results are not
              overwritten.
            </p>
          )}
        </dialog>
      )}
    </>
  )
}
