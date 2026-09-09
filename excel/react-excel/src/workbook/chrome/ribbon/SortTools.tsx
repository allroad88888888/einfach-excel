import { useAtomValue, useSetAtom } from '@einfach/react'
import { useEffect, useId, useRef } from 'react'
import { configureSortAtom, editingSessionAtom, sortFeedbackAtom, sortPanelAtom,
  sortSelectionAtom, getColumnLabel } from '@einfach/spreadsheet-ui-core'
import './selection-size.css'
import './sort.css'

/** 排序入口只发用户选项；dialog 的显示及焦点是这里唯一持有的 DOM 状态。 */
export function SortTools() {
  const panel = useAtomValue(sortPanelAtom)
  const feedback = useAtomValue(sortFeedbackAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const sort = useSetAtom(sortSelectionAtom)
  const configure = useSetAtom(configureSortAtom)
  const ref = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLSelectElement>(null)
  const id = useId()
  const target = panel.target
  useEffect(() => {
    const dialog = ref.current
    if (!dialog || !target) return
    const button = trigger.current
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => { dialog.close?.(); button?.focus({ preventScroll: true }) }
  }, [target])
  const columns = target ? Array.from({ length: target.range.colEnd - target.range.colStart + 1 },
    (_, index) => target.range.colStart + index) : []
  return <>
    <select ref={trigger} className="tool-select" aria-label="Sort selected range" value=""
      disabled={editing || feedback.busy}
      title="Sort selected data by its first column; select all columns that should move together"
      onChange={(event) => {
        const value = event.currentTarget.value
        if (value === 'asc' || value === 'desc') void sort(value)
        if (value === 'custom') void configure('open')
      }}>
      <option value="" disabled>Sort</option>
      <option value="asc">Sort ascending</option>
      <option value="desc">Sort descending</option>
      <option value="custom">Custom sort…</option>
    </select>
    {(feedback.error || feedback.message) && <span className="fill-feedback" aria-label="Sort status"
      role={feedback.error ? 'alert' : 'status'}>{feedback.error || feedback.message}</span>}
    {target && <dialog ref={ref} className="selection-size-dialog sort-dialog"
      aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`}
      onCancel={(event) => { event.preventDefault(); void configure('close') }}>
      <h2 id={`${id}-title`}>Custom sort</h2>
      <p id={`${id}-help`}>Only the selected rectangle moves, including hidden rows.
        Add columns in priority order; blank cells stay at the bottom.</p>
      <form onSubmit={(event) => { event.preventDefault(); void configure('apply') }}>
        <label className="sort-header"><input type="checkbox" checked={panel.hasHeader}
          disabled={feedback.busy} onChange={(event) =>
            void configure({ type: 'header', value: event.currentTarget.checked })} />First row is a header</label>
        {panel.keys.map((key, index) => <fieldset key={index} disabled={feedback.busy}>
          <legend>{index === 0 ? 'Sort by' : `Then by (${index + 1})`}</legend>
          <label htmlFor={`${id}-column-${index}`}>Column</label>
          <select id={`${id}-column-${index}`} value={key.col}
            aria-label={`Sort column ${index + 1}`}
            onChange={(event) => void configure({ type: 'key', index,
              key: { ...key, col: Number(event.currentTarget.value) } })}>
            {columns.map((col) => <option key={col} value={col}
              disabled={panel.keys.some((other, i) => i !== index && other.col === col)}>
              {getColumnLabel(col)}</option>)}
          </select>
          <label htmlFor={`${id}-order-${index}`}>Order</label>
          <select id={`${id}-order-${index}`} aria-label={`Sort order ${index + 1}`} value={key.direction}
            onChange={(event) => {
              const direction = event.currentTarget.value
              if (direction === 'asc' || direction === 'desc')
                void configure({ type: 'key', index, key: { ...key, direction } })
            }}><option value="asc">Ascending</option><option value="desc">Descending</option></select>
          <button type="button" aria-label={`Remove sort level ${index + 1}`}
            disabled={panel.keys.length === 1} onClick={() => void configure({ type: 'remove', index })}>Remove</button>
        </fieldset>)}
        <button type="button" disabled={feedback.busy || panel.keys.length >= Math.min(8, columns.length)}
          onClick={() => void configure('add')}>Add level</button>
        {panel.error && <p role="alert" className="size-error">{panel.error}</p>}
        <div className="size-actions">
          <button type="submit" disabled={feedback.busy}>Apply sort</button>
          <button type="button" disabled={feedback.busy} onClick={() => void configure('close')}>Cancel</button>
        </div>
      </form>
    </dialog>}
  </>
}
