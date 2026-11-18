import { useEffect, useId, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { cycleWorkbookDialogFocus } from '@einfach-excel/react-excel'
import { CELL_FILL_PATTERNS, patternFillImage, type SpreadsheetFillPattern } from '@einfach-excel/spreadsheet-ui-core'
import { configurePatternFillAtom, patternFillPanelAtom } from './core'
import { labels, patternLabels } from './messages'
import './pattern-fill.css'

export function PatternFillDialog() {
  const { i18n } = useLingui()
  const panel = useAtomValue(patternFillPanelAtom)
  const configure = useSetAtom(configurePatternFillAtom)
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!dialog || !panel.open) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => {
      dialog.close?.()
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [panel.open])
  if (!panel.open) return null
  const preview = patternFillImage({ kind: 'pattern', pattern: panel.pattern, foreground: panel.foreground })
  return <dialog ref={ref} className="pattern-fill-dialog" aria-labelledby={`${id}-title`}
    onKeyDown={cycleWorkbookDialogFocus}
    onCancel={event => { event.preventDefault(); void configure('close') }}>
    <h2 id={`${id}-title`}>{i18n._(labels.patternTitle)}</h2>
    <form noValidate onSubmit={event => { event.preventDefault(); void configure('apply') }}>
      <fieldset disabled={panel.busy}>
        <label htmlFor={`${id}-pattern`}>{i18n._(labels.pattern)}</label>
        <select id={`${id}-pattern`} value={panel.pattern} onChange={event => void configure({
          type: 'pattern', value: event.currentTarget.value as SpreadsheetFillPattern,
        })}>
          {CELL_FILL_PATTERNS.map(pattern => <option key={pattern} value={pattern}>
            {i18n._(patternLabels[pattern])}
          </option>)}
        </select>
        {(['foreground', 'background'] as const).map(field => <label key={field}>
          {i18n._(labels[field])}
          <input type="text" value={panel[field]} maxLength={7} spellCheck={false}
            aria-describedby={`${id}-hint`} onChange={event =>
              void configure({ type: field, value: event.currentTarget.value })} />
        </label>)}
      </fieldset>
      <p id={`${id}-hint`}>{i18n._(labels.colorHint)}</p>
      <div className="pattern-fill-preview" role="img" aria-label={i18n._(labels.preview)}
        style={{ backgroundColor: /^#[\da-f]{6}$/i.test(panel.background) ? panel.background : undefined,
          backgroundImage: preview ?? undefined, backgroundSize: '8px 8px' }} />
      {panel.error && <p role="alert">{i18n._(labels[panel.error])}</p>}
      {panel.busy && <p role="status">{i18n._(labels.applying)}</p>}
      <div className="pattern-fill-actions">
        <button type="submit" disabled={panel.busy}>{i18n._(labels.apply)}</button>
        <button type="button" disabled={panel.busy}
          onClick={() => void configure('close')}>{i18n._(labels.cancel)}</button>
      </div>
    </form>
  </dialog>
}
