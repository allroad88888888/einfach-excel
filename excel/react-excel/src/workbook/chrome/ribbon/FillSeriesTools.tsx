import { useAtomValue, useSetAtom } from '@einfach/react'
import { useEffect, useId, useRef } from 'react'
import {
  configureFillSeriesAtom, directionalFillFeedbackAtom, editingSessionAtom, fillSeriesPanelAtom,
} from '@einfach/spreadsheet-ui-core'
import './selection-size.css'
import './fill-series.css'

const KINDS = [
  ['number', 'Number sequence'], ['text-number', 'Text numbering'], ['linear-trend', 'Linear trend'],
] as const

/** 序列面板只负责 DOM 与模态焦点；样本推断全部留在 Rust。 */
export function FillSeriesTools() {
  const state = useAtomValue(fillSeriesPanelAtom)
  const feedback = useAtomValue(directionalFillFeedbackAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const run = useSetAtom(configureFillSeriesAtom)
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
    return () => { dialog.close?.(); button?.focus({ preventScroll: true }) }
  }, [target])
  return <>
    <button ref={buttonRef} type="button" className="tool-select" aria-label="Fill series"
      disabled={editing || feedback.busy} onClick={() => void run('open')}>Series…</button>
    {target && <dialog ref={ref} className="selection-size-dialog fill-series-dialog"
      aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`}
      onCancel={(event) => { event.preventDefault(); void run('close') }}>
      <h2 id={`${id}-title`}>Fill series</h2>
      <p id={`${id}-help`}>Select samples and destinations in one row or column. Keep the first samples;
        extend their pattern into the remaining cells, including hidden cells.</p>
      <form onSubmit={(event) => { event.preventDefault(); void run('apply') }}>
        <label htmlFor={`${id}-kind`}>Sequence type</label>
        <select id={`${id}-kind`} value={state.kind} disabled={feedback.busy}
          onChange={(event) => {
            const kind = KINDS.find(([value]) => value === event.currentTarget.value)?.[0]
            if (kind) void run({ field: 'kind', value: kind })
          }}>
          {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <label htmlFor={`${id}-direction`}>Direction</label>
        <select id={`${id}-direction`} value={state.direction} disabled={feedback.busy}
          onChange={(event) => {
            const value = event.currentTarget.value
            if (value === 'down' || value === 'right') void run({ field: 'direction', value })
          }}>
          <option value="down">Down</option><option value="right">Right</option>
        </select>
        <label htmlFor={`${id}-count`}>Source sample count</label>
        <input id={`${id}-count`} type="number" min={state.kind === 'linear-trend' ? 3 : 2} step="1"
          required value={state.sourceCount} disabled={feedback.busy}
          onChange={(event) => void run({ field: 'sourceCount', value: event.currentTarget.value })} />
        <p className="size-hint">{state.kind === 'linear-trend'
          ? 'At least 3 numeric samples. Rust fits a least-squares line using all samples.'
          : state.kind === 'text-number'
            ? 'At least 2 numbered labels, such as Item001, Item003. Matching padding is preserved.'
            : 'At least 2 numbers with a constant non-zero difference, including decimals.'}</p>
        {state.error && <p role="alert" className="size-error">{state.error}</p>}
        {feedback.busy && <p role="status">Extending series…</p>}
        <div className="size-actions">
          <button type="submit" disabled={feedback.busy}>Apply series</button>
          <button type="button" disabled={feedback.busy} onClick={() => void run('close')}>Cancel</button>
        </div>
      </form>
    </dialog>}
  </>
}
