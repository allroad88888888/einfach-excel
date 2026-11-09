import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { useId } from 'react'
import { closeSparklineDialogAtom, dismissSparklineErrorAtom, editSparklineDialogAtom,
  sparklineDialogAtom, sparklineErrorAtom, submitSparklineDialogAtom } from './core'
import { labels, typeLabels } from './messages'

/** 「创建迷你图」：数据区域与位置范围（同 Excel 的对话框）。 */
export function SparklineDialog() {
  const { i18n } = useLingui()
  const dialog = useAtomValue(sparklineDialogAtom)
  const error = useAtomValue(sparklineErrorAtom)
  const edit = useSetAtom(editSparklineDialogAtom)
  const close = useSetAtom(closeSparklineDialogAtom)
  const submit = useSetAtom(submitSparklineDialogAtom)
  const dismiss = useSetAtom(dismissSparklineErrorAtom)
  const id = useId()
  if (!dialog.open) return null
  const cancel = () => { dismiss(); close() }
  return (
    <div className="plugin-sparkline-dialog" role="dialog" aria-modal="true"
      aria-labelledby={`${id}-title`}
      onKeyDown={(event) => { if (event.key === 'Escape') cancel() }}>
      <form onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <h2 id={`${id}-title`}>
          {i18n._(labels.create)} · {i18n._(typeLabels[dialog.type])}</h2>
        <label>{i18n._(labels.data)}
          <input autoFocus value={dialog.data}
            onChange={(event) => edit({ data: event.currentTarget.value })} /></label>
        <label>{i18n._(labels.location)}
          <input value={dialog.location}
            onChange={(event) => edit({ location: event.currentTarget.value })} /></label>
        {error && <p role="alert">{i18n._({ id: error, message: error })}</p>}
        <footer>
          <button type="submit">{i18n._(labels.ok)}</button>
          <button type="button" onClick={cancel}>{i18n._(labels.cancel)}</button>
        </footer>
      </form>
    </div>
  )
}
