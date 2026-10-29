import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useEffect, useId, useRef } from 'react'
import {
  configureFillSeriesAtom, directionalFillFeedbackAtom, editingSessionAtom, fillSeriesPanelAtom,
  FILL_SERIES_OPTIONS, minimumFillSamples,
} from '@einfach-excel/spreadsheet-ui-core'
import './selection-size.css'
import './fill-series.css'
import { CustomFillLists } from './fill-series/CustomFillLists'
import { cycleDialogFocus } from './dialog-focus'

/** 序列面板只负责 DOM 与模态焦点；样本推断全部留在 Rust。 */
export function FillSeriesTools() {
  const { i18n, t } = useLingui()
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
    <button ref={buttonRef} type="button" className="tool-select" aria-label={t`Fill series`}
      disabled={editing || feedback.busy} onClick={() => void run('open')}><Trans>Series…</Trans></button>
    {target && <dialog ref={ref} className="selection-size-dialog fill-series-dialog"
      aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`}
      onKeyDown={cycleDialogFocus}
      onCancel={(event) => { event.preventDefault(); void run('close') }}>
      <h2 id={`${id}-title`}><Trans>Fill series</Trans></h2>
      <p id={`${id}-help`}><Trans>Select samples and destinations in one row or column. Keep the first samples;
        extend their pattern into the remaining cells, including hidden cells.</Trans></p>
      <form onSubmit={(event) => { event.preventDefault(); void run('apply') }}>
        <label htmlFor={`${id}-kind`}><Trans>Sequence type</Trans></label>
        <select id={`${id}-kind`} value={state.kind} disabled={feedback.busy}
          onChange={(event) => {
            const kind = FILL_SERIES_OPTIONS.find(
              (option) => option.kind === event.currentTarget.value,
            )?.kind
            if (kind) void run({ field: 'kind', value: kind })
          }}>
          {FILL_SERIES_OPTIONS.map(({ kind, label }) =>
            <option key={kind} value={kind}>{translateFeedback(i18n, label)}</option>)}
        </select>
        <label htmlFor={`${id}-direction`}><Trans>Direction</Trans></label>
        <select id={`${id}-direction`} value={state.direction} disabled={feedback.busy}
          onChange={(event) => {
            const value = event.currentTarget.value
            if (value === 'down' || value === 'right') void run({ field: 'direction', value })
          }}>
          <option value="down"><Trans>Down</Trans></option><option value="right"><Trans>Right</Trans></option>
        </select>
        <label htmlFor={`${id}-count`}><Trans>Source sample count</Trans></label>
        <input id={`${id}-count`} type="number" min={minimumFillSamples(state.kind)} step="1"
          required value={state.sourceCount} disabled={feedback.busy}
          onChange={(event) => void run({ field: 'sourceCount', value: event.currentTarget.value })} />
        {state.kind === 'custom-list' && <CustomFillLists />}
        <p className="size-hint">{state.kind === 'date'
          ? t`One date advances by a day. Two or more dates infer day, week or month steps; month ends stay at month end.`
          : minimumFillSamples(state.kind) === 1
          ? state.kind === 'custom-list'
            ? t`One item per line (2–512 unique items). One source sample follows the list; more samples infer a cyclic step.`
            : t`English short/full names or Chinese names. One source sample advances by one; more samples infer the cyclic step.`
          : state.kind === 'linear-trend'
          ? t`At least 3 numeric samples. Rust fits a least-squares line using all samples.`
          : state.kind === 'text-number'
            ? t`At least 2 numbered labels, such as Item001, Item003. Matching padding is preserved.`
            : t`At least 2 numbers with a constant non-zero difference, including decimals.`}</p>
        {state.error && <p role="alert" className="size-error">{translateFeedback(i18n, state.error)}</p>}
        {state.notice && <p role="status">{translateFeedback(i18n, state.notice)}</p>}
        {feedback.busy && <p role="status"><Trans>Extending series…</Trans></p>}
        <div className="size-actions">
          <button type="submit" disabled={feedback.busy}><Trans>Apply series</Trans></button>
          <button type="button" disabled={feedback.busy} onClick={() => void run('close')}><Trans>Cancel</Trans></button>
        </div>
      </form>
    </dialog>}
  </>
}
