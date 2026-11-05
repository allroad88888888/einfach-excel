import { useId, useLayoutEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import {
  configureImageExportAtom, deliverImageExportAtom, imageExportPanelAtom,
} from './core'
import { copyImage, downloadImage } from './output'
import { labels } from './messages'
import './image-export.css'

export function ImageExportPanel() {
  const { i18n } = useLingui()
  const state = useAtomValue(imageExportPanelAtom)
  const configure = useSetAtom(configureImageExportAtom)
  const deliver = useSetAtom(deliverImageExportAtom)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!state.open || !dialog) return
    const opener = document.activeElement as HTMLElement | null
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => {
      dialog.close?.()
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [state.open])
  if (!state.open) return null
  return <dialog ref={dialogRef} className="image-export-panel" aria-labelledby={`${id}-title`}
    onCancel={(event) => { event.preventDefault(); configure('close') }}>
    <h2 id={`${id}-title`}>{i18n._(labels.title)}</h2>
    <p>{i18n._(labels.hint)}</p>
    <label htmlFor={`${id}-scale`}>{i18n._(labels.scale)}</label>{' '}
    <select id={`${id}-scale`} value={state.scale} disabled={state.busy}
      onChange={(event) => configure({ scale: Number(event.currentTarget.value) })}>
      <option value="1">1×</option><option value="2">2×</option>
    </select>
    {state.error && <p role="alert">{i18n._({ id: state.error, message: state.error })}</p>}
    {state.busy && <p role="status">{i18n._(labels.busy)}</p>}
    {state.success && <p role="status">{i18n._(labels.success)}</p>}
    <div className="image-export-actions">
      <button type="button" disabled={state.busy && !!state.snapshot}
        onClick={() => configure('close')}>{i18n._(labels.close)}</button>
      <button type="button" disabled={state.busy || !state.snapshot}
        onClick={() => void deliver(copyImage)}>{i18n._(labels.copy)}</button>
      <button type="button" disabled={state.busy || !state.snapshot}
        onClick={() => void deliver(downloadImage)}>{i18n._(labels.download)}</button>
    </div>
  </dialog>
}
