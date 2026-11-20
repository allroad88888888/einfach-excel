import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { visualSortPanelAtom, configureVisualSortAtom } from './core/visual-sort'
import { iconLabels } from './icon-messages'

const sets = [
  { id: 'three-arrows', label: 'arrows', entries: ['arrowDown', 'arrowRight', 'arrowUp'] },
  { id: 'three-traffic-lights', label: 'lights', entries: ['redLight', 'yellowLight', 'greenLight'] },
  { id: 'three-flags', label: 'flags', entries: ['redFlag', 'yellowFlag', 'greenFlag'] },
] as const

export function IconSortTargetFields({ index }: { readonly index: number }) {
  const { i18n } = useLingui()
  const panel = useAtomValue(visualSortPanelAtom)
  const configure = useSetAtom(configureVisualSortAtom)
  const level = panel.keys[index]
  if (!level || !('sortOn' in level) || level.sortOn !== 'icon') return null
  const target = level.icon
  return <label>{i18n._(iconLabels.target)}
    <select aria-label={i18n._(iconLabels.target)}
      value={target ? `${target.set}:${target.index}` : 'none'} onChange={event => {
        const value = event.currentTarget.value
        if (value === 'none') {
          void configure({ type: 'key', index, key: { ...level, icon: null } })
          return
        }
        const [setName, rawIndex] = value.split(':')
        const set = sets.find(item => item.id === setName)?.id
        const iconIndex = Number(rawIndex)
        if (set && (iconIndex === 0 || iconIndex === 1 || iconIndex === 2)) {
          void configure({ type: 'key', index, key: { ...level, icon: { set, index: iconIndex } } })
        }
      }}>
      <option value="none">{i18n._(iconLabels.none)}</option>
      {sets.map(set => <optgroup key={set.id} label={i18n._(iconLabels[set.label])}>
        {set.entries.map((label, position) => <option key={label} value={`${set.id}:${position}`}>
          {i18n._(iconLabels[label])}
        </option>)}
      </optgroup>)}
    </select>
  </label>
}
