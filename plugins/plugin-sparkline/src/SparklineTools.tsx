import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { openSparklineDialogAtom, parseSparklineSpec, removeSparklineAtom, selectedSparklineAtom,
  SPARKLINE_TYPES, updateSparklineAtom, type SparklineSpec } from './core'
import { labels, typeLabels } from './messages'

const ICONS = { line: '⟋', column: '▮', winLoss: '±' }
const POINTS = ['high', 'low', 'first', 'last', 'negative', 'markers', 'axis'] as const

/**
 * 「插入」组：按类型创建迷你图。活动单元格在迷你图组里时，同组出现设计选项
 * （改类型、颜色、标记点、清除），对应 Excel 的「迷你图」上下文选项卡。
 */
export function SparklineTools() {
  const { i18n } = useLingui()
  const open = useSetAtom(openSparklineDialogAtom)
  const update = useSetAtom(updateSparklineAtom)
  const remove = useSetAtom(removeSparklineAtom)
  const selected = useAtomValue(selectedSparklineAtom)
  const spec = selected ? parseSparklineSpec(selected.payload) : null
  const patch = (value: Partial<SparklineSpec>) => void update(value)
  return (
    <div className="plugin-sparkline-tools" role="group" aria-label={i18n._(labels.group)}>
      {SPARKLINE_TYPES.map((type) => {
        const name = `${i18n._(labels.create)}: ${i18n._(typeLabels[type])}`
        return <button key={type} type="button" className="tool-button" aria-label={name}
          title={name} data-sparkline-create={type} onClick={() => open(type)}>
          {ICONS[type]}</button>
      })}
      {spec && <>
        <select aria-label={i18n._(labels.type)} value={spec.type}
          onChange={(event) => patch({ type: event.currentTarget.value as SparklineSpec['type'] })}>
          {SPARKLINE_TYPES.map((type) =>
            <option key={type} value={type}>{i18n._(typeLabels[type])}</option>)}
        </select>
        <input type="color" aria-label={i18n._(labels.color)} value={spec.color}
          onChange={(event) => patch({ color: event.currentTarget.value.toUpperCase() })} />
        <input type="color" aria-label={i18n._(labels.markerColor)} value={spec.markerColor}
          onChange={(event) => {
            const color = event.currentTarget.value.toUpperCase()
            patch({ markerColor: color, highColor: color, lowColor: color, firstColor: color,
              lastColor: color, negativeColor: color })
          }} />
        {POINTS.map((key) => (
          <label key={key} className="plugin-sparkline-flag">
            <input type="checkbox" checked={spec[key]}
              onChange={(event) => patch({ [key]: event.currentTarget.checked })} />
            {i18n._(labels[key])}
          </label>
        ))}
        <button type="button" className="tool-button" aria-label={i18n._(labels.remove)}
          title={i18n._(labels.remove)} onClick={() => void remove()}>⌫</button>
      </>}
    </div>
  )
}
