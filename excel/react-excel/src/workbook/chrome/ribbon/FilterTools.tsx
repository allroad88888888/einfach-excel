import { useAtomValue, useSetAtom } from '@einfach/react'
import { useEffect, useId, useRef } from 'react'
import {
  activeWorkbookSheetAtom,
  configureNativeFilterAtom,
  editingSessionAtom,
  getColumnLabel,
  nativeFilterFeedbackAtom,
  nativeFilterPanelAtom,
  nativeFilterRangeAtom,
  nativeFilterRulesAtom,
  runNativeFilterAtom,
} from '@einfach/spreadsheet-ui-core'
import { FilterConditionFields } from './FilterConditionFields'
import './selection-size.css'
import './filter.css'

/** 工具栏和数据表头复用同一个条件弹窗，区域只读 Rust 投影。 */
export function FilterTools() {
  const sheet = useAtomValue(activeWorkbookSheetAtom)
  const panel = useAtomValue(nativeFilterPanelAtom)
  const feedback = useAtomValue(nativeFilterFeedbackAtom)
  const rules = useAtomValue(nativeFilterRulesAtom)
  const range = useAtomValue(nativeFilterRangeAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const configure = useSetAtom(configureNativeFilterAtom)
  const run = useSetAtom(runNativeFilterAtom)
  const ref = useRef<HTMLDialogElement>(null)
  const toolbarTrigger = useRef<HTMLSelectElement>(null)
  const id = useId()
  const target = panel.sheetId
  useEffect(() => {
    const dialog = ref.current
    if (!dialog || !target) return
    const trigger =
      panel.column === undefined
        ? toolbarTrigger.current
        : (document.activeElement as HTMLElement | null)
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => {
      dialog.close?.()
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [target, panel.column])
  return (
    <>
      <select
        ref={toolbarTrigger}
        className="ribbon-select"
        aria-label="Worksheet filter"
        value=""
        disabled={feedback.busy || editing || !sheet}
        onChange={(event) => {
          const action = event.currentTarget.value
          if (action === 'open') void configure('open')
          else if (action === 'selection') void run('selection')
          else if (action === 'reapply' || action === 'clear') void run({ action })
        }}
      >
        <option value="" disabled>
          {rules.length ? `Filter (${rules.length})` : 'Filter'}
        </option>
        <option value="selection">Filter selected range (first row is header)</option>
        <option value="open">Filter conditions…</option>
        <option value="reapply" disabled={!rules.length}>
          Reapply filter
        </option>
        <option value="clear" disabled={!rules.length && !range}>
          Clear filter
        </option>
      </select>
      {(feedback.error || feedback.message) && (
        <span
          className="filter-feedback"
          title={feedback.error || feedback.message}
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
            {panel.range
              ? `Range ${getColumnLabel(panel.range.colStart)}${panel.range.rowStart + 1}:${getColumnLabel(panel.range.colEnd)}${panel.range.rowEnd + 1}. Its first row stays visible.`
              : 'Filters the worksheet’s used rows, not just the selection. Row 1 stays visible.'}
            {' Every condition must match. After editing values, use Reapply filter.'}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void configure('apply')
            }}
          >
            <FilterConditionFields />
            {panel.column === undefined && (
              <button
                type="button"
                disabled={
                  feedback.busy ||
                  panel.conditions.length >=
                    Math.min(
                      8,
                      panel.range
                        ? panel.range.colEnd - panel.range.colStart + 1
                        : (sheet?.colCount ?? 0),
                    )
                }
                onClick={() => void configure('add')}
              >
                Add condition
              </button>
            )}
            {panel.column !== undefined && (
              <button
                type="button"
                disabled={feedback.busy || !rules.some((rule) => rule.colIndex === panel.column)}
                onClick={() => void configure('clear-column')}
              >
                Clear column {getColumnLabel(panel.column)} filter
              </button>
            )}
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
