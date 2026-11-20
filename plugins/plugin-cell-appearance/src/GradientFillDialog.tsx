import { useEffect, useId, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { cycleWorkbookDialogFocus } from '@einfach-excel/react-excel'
import { gradientFillImage } from '@einfach-excel/spreadsheet-ui-core'
import { configureGradientFillAtom, gradientFillPanelAtom, gradientFillPreviewAtom } from './core'
import { GradientGeometryFields } from './GradientGeometryFields'
import { labels } from './messages'
import './fill-dialog.css'

export function GradientFillDialog() {
  const { i18n } = useLingui()
  const panel = useAtomValue(gradientFillPanelAtom)
  const preview = useAtomValue(gradientFillPreviewAtom)
  const configure = useSetAtom(configureGradientFillAtom)
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
  const rectangular = panel.draft.mode === 'path-gradient'
  return <dialog ref={ref} className="cell-fill-dialog" aria-labelledby={`${id}-title`}
    onKeyDown={cycleWorkbookDialogFocus}
    onCancel={event => { event.preventDefault(); void configure('close') }}>
    <h2 id={`${id}-title`}>{i18n._(labels.gradientTitle)}</h2>
    <form noValidate onSubmit={event => { event.preventDefault(); void configure('apply') }}>
      <fieldset disabled={panel.busy}>
        <GradientGeometryFields />
        {(['startColor', 'endColor'] as const).map((field, index) => <label key={field}>
          {i18n._(labels[rectangular ? (index === 0 ? 'innerColor' : 'outerColor') : field])}
          <input type="text" value={panel.draft[field]} maxLength={7} spellCheck={false}
            aria-describedby={`${id}-hint`} onChange={event =>
              void configure({ type: field, value: event.currentTarget.value })} />
        </label>)}
      </fieldset>
      <p id={`${id}-hint`}>{i18n._(labels.colorHint)}</p>
      <div className="cell-fill-preview" role="img" aria-label={i18n._(labels.preview)}
        style={{ backgroundColor: panel.draft.fallback, backgroundSize: '100% 100%',
          backgroundImage: preview ? gradientFillImage(preview) : undefined }} />
      {panel.error && <p role="alert">{i18n._(labels[panel.error])}</p>}
      {panel.busy && <p role="status">{i18n._(labels.applying)}</p>}
      <div className="cell-fill-actions">
        <button type="submit" disabled={panel.busy}>{i18n._(labels.apply)}</button>
        <button type="button" disabled={panel.busy}
          onClick={() => void configure('close')}>{i18n._(labels.cancel)}</button>
      </div>
    </form>
  </dialog>
}
