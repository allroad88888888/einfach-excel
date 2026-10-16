import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useEffect, useId, useRef } from 'react'
import { configureSortAtom, editingSessionAtom, sortFeedbackAtom, sortPanelAtom,
  sortSelectionAtom, getColumnLabel } from '@einfach/spreadsheet-ui-core'
import './selection-size.css'
import './sort.css'

/** 排序入口只发用户选项；dialog 的显示及焦点是这里唯一持有的 DOM 状态。 */
export function SortTools() {
  const { i18n, t } = useLingui()
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
    <select ref={trigger} className="tool-select" aria-label={t`Sort selected range`} value=""
      disabled={editing || feedback.busy}
      title={t`Sort selected data by its first column; select all columns that should move together`}
      onChange={(event) => {
        const value = event.currentTarget.value
        if (value === 'asc' || value === 'desc') void sort(value)
        if (value === 'custom') void configure('open')
      }}>
      <option value="" disabled><Trans>Sort</Trans></option>
      <option value="asc"><Trans>Sort ascending</Trans></option>
      <option value="desc"><Trans>Sort descending</Trans></option>
      <option value="custom"><Trans>Custom sort…</Trans></option>
    </select>
    {(feedback.error || feedback.message) && <span className="fill-feedback" aria-label={t`Sort status`}
      role={feedback.error ? 'alert' : 'status'}>{translateFeedback(i18n, feedback.error || feedback.message)}</span>}
    {target && <dialog ref={ref} className="selection-size-dialog sort-dialog"
      aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`}
      onCancel={(event) => { event.preventDefault(); void configure('close') }}>
      <h2 id={`${id}-title`}><Trans>Custom sort</Trans></h2>
      <p id={`${id}-help`}><Trans>Only the selected rectangle moves. Filtered rows stay in place;
        manually hidden rows participate. Levels are applied from top to bottom.</Trans></p>
      <form onSubmit={(event) => { event.preventDefault(); void configure('apply') }}>
        <label className="sort-header"><input type="checkbox" checked={panel.hasHeader}
          disabled={feedback.busy} onChange={(event) =>
            void configure({ type: 'header', value: event.currentTarget.checked })} /><Trans>First row is a header</Trans></label>
        <div className="sort-options">
          <label className="sort-header"><input type="checkbox" checked={panel.caseSensitive}
            disabled={feedback.busy} onChange={(event) => void configure({
              type: 'case-sensitive', value: event.currentTarget.checked,
            })} /><Trans>Case sensitive</Trans></label>
          <label><Trans>Empty cells </Trans><select aria-label={t`Empty cell position`} disabled={feedback.busy}
            value={panel.emptyFirst ? 'first' : 'last'} onChange={(event) => void configure({
              type: 'empty-first', value: event.currentTarget.value === 'first',
            })}><option value="last"><Trans>Last</Trans></option><option value="first"><Trans>First</Trans></option></select></label>
        </div>
        {panel.keys.map((key, index) => <fieldset key={index} disabled={feedback.busy}>
          <legend>{index === 0 ? t`Sort by` : t`Then by (${index + 1})`}</legend>
          <label htmlFor={`${id}-column-${index}`}><Trans>Column</Trans></label>
          <select id={`${id}-column-${index}`} value={key.col}
            aria-label={t`Sort column ${index + 1}`}
            onChange={(event) => void configure({ type: 'key', index,
              key: { ...key, col: Number(event.currentTarget.value) } })}>
            {columns.map((col) => <option key={col} value={col}
              disabled={panel.keys.some((other, i) => i !== index && other.col === col)}>
              {getColumnLabel(col)}</option>)}
          </select>
          <label htmlFor={`${id}-order-${index}`}><Trans>Order</Trans></label>
          <select id={`${id}-order-${index}`} aria-label={t`Sort order ${index + 1}`} value={key.direction}
            onChange={(event) => {
              const direction = event.currentTarget.value
              if (direction === 'asc' || direction === 'desc')
                void configure({ type: 'key', index, key: { ...key, direction } })
            }}><option value="asc"><Trans>Ascending</Trans></option><option value="desc"><Trans>Descending</Trans></option></select>
          <div className="sort-level-actions">
            {(['up', 'down'] as const).map((direction) => <button key={direction} type="button"
              aria-label={direction === 'up' ? t`Move sort level ${index + 1} up` : t`Move sort level ${index + 1} down`}
              disabled={direction === 'up' ? index === 0 : index === panel.keys.length - 1}
              onClick={async () => {
                if (await configure({ type: 'move', index, direction })) {
                  const next = index + (direction === 'up' ? -1 : 1)
                  ref.current?.querySelector<HTMLSelectElement>(`[id="${id}-column-${next}"]`)?.focus()
                }
              }}>{direction === 'up' ? t`Move up` : t`Move down`}</button>)}
            <button type="button" aria-label={t`Remove sort level ${index + 1}`}
              disabled={panel.keys.length === 1}
              onClick={() => void configure({ type: 'remove', index })}><Trans>Remove</Trans></button>
          </div>
        </fieldset>)}
        <button type="button" disabled={feedback.busy || panel.keys.length >= Math.min(8, columns.length)}
          onClick={() => void configure('add')}><Trans>Add level</Trans></button>
        {panel.error && <p role="alert" className="size-error">{translateFeedback(i18n, panel.error)}</p>}
        <div className="size-actions">
          <button type="submit" disabled={feedback.busy}><Trans>Apply sort</Trans></button>
          <button type="button" disabled={feedback.busy} onClick={() => void configure('close')}><Trans>Cancel</Trans></button>
        </div>
      </form>
    </dialog>}
  </>
}
