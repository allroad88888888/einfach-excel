import { useId } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { configureGradientFillAtom, gradientFillPanelAtom } from './core'
import { labels } from './messages'

export function GradientGeometryFields() {
  const id = useId()
  const { i18n } = useLingui()
  const { draft } = useAtomValue(gradientFillPanelAtom)
  const configure = useSetAtom(configureGradientFillAtom)
  return <>
    <label htmlFor={id}>{i18n._(labels.gradientType)}</label>
    <select id={id} value={draft.mode} onChange={event => void configure({ type: 'mode',
      value: event.currentTarget.value as typeof draft.mode })}>
      <option value="linear-gradient">{i18n._(labels.linear)}</option>
      <option value="path-gradient">{i18n._(labels.rectangular)}</option>
    </select>
    {draft.mode === 'linear-gradient' ? <label>{i18n._(labels.angle)}
      <input type="text" inputMode="decimal" value={draft.angle.text} maxLength={64}
        onChange={event => void configure({ type: 'angle', value: event.currentTarget.value })} />
    </label> : <div className="gradient-rectangle-fields">
      {(['left', 'right', 'top', 'bottom'] as const).map(edge => <label key={edge}>
        {i18n._(labels[edge])}
        <input type="text" inputMode="decimal" value={draft.rectangle[edge].text} maxLength={64}
          onChange={event => void configure({ type: edge, value: event.currentTarget.value })} />
      </label>)}
    </div>}
  </>
}
