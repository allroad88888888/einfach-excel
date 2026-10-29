import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeCellFormatAtom, editingSessionAtom, runTextLayoutAtom, textLayoutFeedbackAtom,
  type TextLayoutAction,
} from '@einfach-excel/spreadsheet-ui-core'
import { preserveToolFocus } from './tool-focus'

type Horizontal = Extract<TextLayoutAction, { type: 'horizontal-alignment' }>['value']
type Vertical = Extract<TextLayoutAction, { type: 'vertical-alignment' }>['value']
const ROTATIONS = [-90, -45, 0, 45, 90, 'vertical'] as const

/** 原生选择框负责键盘交互；写入、等待与错误由同一个 UI Core command 管理。 */
export function TextLayoutTools() {
  const { i18n, t } = useLingui()
  const format = useAtomValue(activeCellFormatAtom)
  const feedback = useAtomValue(textLayoutFeedbackAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const run = useSetAtom(runTextLayoutAtom)
  const disabled = editing || feedback.busy
  const rotation = format.rotation ?? 0
  return <span className="text-layout-tools">
    <select className="tool-select text-layout-select" aria-label={t`Horizontal alignment`}
      title={t`Horizontal alignment`} value={format.align ?? 'default'} disabled={disabled}
      onChange={(event) => void preserveToolFocus(event.currentTarget, () => run({
        type: 'horizontal-alignment', value: event.currentTarget.value as Horizontal,
      }))}>
      <option value="default"><Trans>Auto</Trans></option><option value="left"><Trans>Left</Trans></option>
      <option value="center"><Trans>Center</Trans></option><option value="right"><Trans>Right</Trans></option>
    </select>
    <select className="tool-select text-layout-select" aria-label={t`Vertical alignment`}
      title={t`Vertical alignment`} value={format.verticalAlign ?? 'default'} disabled={disabled}
      onChange={(event) => void preserveToolFocus(event.currentTarget, () => run({
        type: 'vertical-alignment', value: event.currentTarget.value as Vertical }))}>
      <option value="default"><Trans>Default</Trans></option><option value="top"><Trans>Top</Trans></option>
      <option value="center"><Trans>Middle</Trans></option><option value="bottom"><Trans>Bottom</Trans></option>
    </select>
    <select className="tool-select text-layout-select" aria-label={t`Text rotation`}
      title={t`Text rotation`} value={rotation} disabled={disabled}
      onChange={(event) => void preserveToolFocus(event.currentTarget, () => run({ type: 'text-rotation',
        value: event.currentTarget.value === 'vertical'
          ? 'vertical' : Number(event.currentTarget.value) }))}>
      {ROTATIONS.map((value) => <option key={value} value={value}>
        {value === 'vertical' ? t`Vertical` : `${value}°`}
      </option>)}
      {!ROTATIONS.some((value) => value === rotation) && (
        <option value={rotation}>{rotation}°</option>
      )}
    </select>
    {feedback.busy && <span role="status"><Trans>Applying layout…</Trans></span>}
    {feedback.error && <span className="text-layout-error" role="alert">
      {translateFeedback(i18n, feedback.error)}
      <button type="button" className="tool-button" aria-label={t`Dismiss layout error`}
        onClick={() => void run('dismiss')}>×</button>
    </span>}
  </span>
}
