import { useAtomValue, useSetAtom } from '@einfach/react'
import { useEffect, useId, useRef } from 'react'
import {
  activeWorkbookSheetAtom,
  configureNativeFilterAtom,
  editingSessionAtom,
  getColumnLabel,
  nativeFilterFeedbackAtom,
  nativeFilterPanelAtom,
  nativeFilterRulesAtom,
  runNativeFilterAtom,
  type ColumnFilterRule,
} from '@einfach/spreadsheet-ui-core'
import './selection-size.css'
import './filter.css'

/** 筛选面板只有选项与焦点；隐藏集合由 Rust 投影驱动原有网格。 */
export function FilterTools() {
  const sheet = useAtomValue(activeWorkbookSheetAtom)
  const panel = useAtomValue(nativeFilterPanelAtom)
  const feedback = useAtomValue(nativeFilterFeedbackAtom)
  const rules = useAtomValue(nativeFilterRulesAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const configure = useSetAtom(configureNativeFilterAtom)
  const run = useSetAtom(runNativeFilterAtom)
  const ref = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLSelectElement>(null)
  const id = useId()
  const target = panel.sheetId
  useEffect(() => {
    const dialog = ref.current
    if (!dialog || !target) return
    const button = trigger.current
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => {
      dialog.close?.()
      button?.focus({ preventScroll: true })
    }
  }, [target])
  return (
    <>
      <select
        ref={trigger}
        className="ribbon-select"
        aria-label="Worksheet filter"
        value=""
        disabled={feedback.busy || editing || !sheet}
        onChange={(event) => {
          const action = event.currentTarget.value
          if (action === 'open') void configure('open')
          else if (action === 'reapply' || action === 'clear') void run({ action })
        }}
      >
        <option value="" disabled>
          {rules.length ? `Filter (${rules.length})` : 'Filter'}
        </option>
        <option value="open">Filter conditions…</option>
        <option value="reapply" disabled={!rules.length}>
          Reapply filter
        </option>
        <option value="clear" disabled={!rules.length}>
          Clear filter
        </option>
      </select>
      {(feedback.error || feedback.message) && (
        <span
          className="clipboard-feedback"
          aria-label="Filter status"
          role={feedback.error ? 'alert' : 'status'}
        >
          {feedback.error || feedback.message}
        </span>
      )}
      {target && (
        <dialog
          ref={ref}
          className="selection-size-dialog filter-dialog"
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-help`}
          onCancel={(event) => {
            event.preventDefault()
            void configure('close')
          }}
        >
          <h2 id={`${id}-title`}>Filter conditions</h2>
          <p id={`${id}-help`}>
            Filters the worksheet’s used rows, not just the selection. Row 1 stays visible. Every
            condition must match. After editing values, use Reapply filter.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void configure('apply')
            }}
          >
            {panel.conditions.map((item, index) => (
              <fieldset key={index} disabled={feedback.busy}>
                <legend>{index === 0 ? 'Show rows where' : 'And'}</legend>
                <label htmlFor={`${id}-col-${index}`}>Column</label>
                <select
                  id={`${id}-col-${index}`}
                  aria-label={`Filter column ${index + 1}`}
                  value={item.col}
                  onChange={(event) =>
                    void configure({
                      type: 'change',
                      index,
                      patch: { col: Number(event.currentTarget.value) },
                    })
                  }
                >
                  {Array.from({ length: sheet?.colCount ?? 0 }, (_, col) => (
                    <option
                      key={col}
                      value={col}
                      disabled={panel.conditions.some(
                        (other, i) => i !== index && other.col === col,
                      )}
                    >
                      {getColumnLabel(col)}
                    </option>
                  ))}
                </select>
                <label htmlFor={`${id}-kind-${index}`}>Condition</label>
                <select
                  id={`${id}-kind-${index}`}
                  aria-label={`Filter condition ${index + 1}`}
                  value={item.kind}
                  onChange={(event) =>
                    void configure({
                      type: 'change',
                      index,
                      patch: { kind: event.currentTarget.value as ColumnFilterRule['kind'] },
                    })
                  }
                >
                  <option value="equals">Equals</option>
                  <option value="contains">Contains</option>
                  <option value="range">Number range</option>
                  <option value="list">One of these values</option>
                </select>
                {item.kind === 'range' ? (
                  <>
                    <label htmlFor={`${id}-min-${index}`}>Minimum</label>
                    <input
                      id={`${id}-min-${index}`}
                      aria-label={`Minimum ${index + 1}`}
                      inputMode="decimal"
                      value={item.min}
                      onChange={(event) =>
                        void configure({
                          type: 'change',
                          index,
                          patch: { min: event.currentTarget.value },
                        })
                      }
                    />
                    <label htmlFor={`${id}-max-${index}`}>Maximum</label>
                    <input
                      id={`${id}-max-${index}`}
                      aria-label={`Maximum ${index + 1}`}
                      inputMode="decimal"
                      value={item.max}
                      onChange={(event) =>
                        void configure({
                          type: 'change',
                          index,
                          patch: { max: event.currentTarget.value },
                        })
                      }
                    />
                  </>
                ) : (
                  <>
                    <label htmlFor={`${id}-value-${index}`}>
                      {item.kind === 'list' ? 'Values (one per line)' : 'Value'}
                    </label>
                    {item.kind === 'list' ? (
                      <textarea
                        id={`${id}-value-${index}`}
                        aria-label={`Filter value ${index + 1}`}
                        value={item.value}
                        onChange={(event) =>
                          void configure({
                            type: 'change',
                            index,
                            patch: { value: event.currentTarget.value },
                          })
                        }
                      />
                    ) : (
                      <input
                        id={`${id}-value-${index}`}
                        aria-label={`Filter value ${index + 1}`}
                        value={item.value}
                        onChange={(event) =>
                          void configure({
                            type: 'change',
                            index,
                            patch: { value: event.currentTarget.value },
                          })
                        }
                      />
                    )}
                    {item.kind !== 'list' && (
                      <label className="filter-case">
                        <input
                          type="checkbox"
                          checked={item.caseSensitive}
                          onChange={(event) =>
                            void configure({
                              type: 'change',
                              index,
                              patch: { caseSensitive: event.currentTarget.checked },
                            })
                          }
                        />
                        Match case
                      </label>
                    )}
                  </>
                )}
                <button
                  type="button"
                  aria-label={`Remove condition ${index + 1}`}
                  disabled={panel.conditions.length === 1}
                  onClick={() => void configure({ type: 'remove', index })}
                >
                  Remove
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              disabled={
                feedback.busy || panel.conditions.length >= Math.min(8, sheet?.colCount ?? 0)
              }
              onClick={() => void configure('add')}
            >
              Add condition
            </button>
            {panel.error && (
              <p role="alert" className="size-error">
                {panel.error}
              </p>
            )}
            <div className="size-actions">
              <button type="submit" disabled={feedback.busy}>
                Apply filter
              </button>
              <button
                type="button"
                disabled={feedback.busy}
                onClick={() => void configure('close')}
              >
                Cancel
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  )
}
