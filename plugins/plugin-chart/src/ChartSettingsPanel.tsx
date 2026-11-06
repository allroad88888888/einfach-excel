import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { useId } from 'react'
import { CHART_TYPES, chartSettingsAtom, EMPTY_CELL_MODES, hasAxes, LEGEND_POSITIONS, STACK_MODES,
  supportsStack,
  updateChartSettingsAtom, type ChartSpec } from './core'
import { emptyCellLabels, labels, legendLabels, stackLabels, typeLabels } from './messages'
import { Choice, NumberField, TextField, Toggle } from './settings-fields'
import { ChartExportActions } from './ChartExportActions'
import { ChartStyleFields } from './ChartStyleFields'
import { ComboSeriesFields } from './ComboSeriesFields'

/** 非模态侧栏：改动立即生效，图表与表格保持可见；关闭不撤销已做的改动。 */
export function ChartSettingsPanel() {
  const { i18n } = useLingui()
  const panel = useAtomValue(chartSettingsAtom)
  const update = useSetAtom(updateChartSettingsAtom)
  const id = useId()
  if (!panel.open) return null
  const { spec, busy } = panel
  const patch = (value: Partial<ChartSpec>) => void update({ type: 'spec', patch: value })
  const options = <T extends string>(values: readonly T[],
    names: Record<T, { id: string; message: string }>) =>
    values.map((value) => ({ value, label: i18n._(names[value]) }))
  return (
    <aside className="plugin-chart-settings" role="dialog" aria-modal="false"
      aria-labelledby={`${id}-title`} data-chart-id={panel.drawing.id}
      onKeyDown={(event) => { if (event.key === 'Escape') void update({ type: 'close' }) }}>
      <header>
        <h2 id={`${id}-title`}>{i18n._(labels.settings)}</h2>
        <button type="button" aria-label={i18n._(labels.close)}
          onClick={() => void update({ type: 'close' })}>×</button>
      </header>
      <Choice label={i18n._(labels.type)} value={spec.type} disabled={busy}
        options={options(CHART_TYPES, typeLabels)}
        onChange={(type) => patch({ type, ...(supportsStack(type) ? {} : { stack: 'none' }) })} />
      <div className="plugin-chart-field">
        <label htmlFor={`${id}-range`}>{i18n._(labels.range)}</label>
        <div className="plugin-chart-range">
          <input id={`${id}-range`} type="text" value={panel.rangeDraft} disabled={busy}
            spellCheck={false}
            onChange={(event) =>
              void update({ type: 'rangeDraft', text: event.currentTarget.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void update({ type: 'applyRange' })
            }} />
          <button type="button" disabled={busy}
            onClick={() => void update({ type: 'applyRange' })}>{i18n._(labels.applyRange)}</button>
        </div>
      </div>
      {spec.type === 'combo' && <ComboSeriesFields drawing={panel.drawing} spec={spec}
        disabled={busy} patch={patch} />}
      {panel.error && <p className="plugin-chart-error" role="alert">
        {i18n._({ id: panel.error, message: panel.error })}</p>}
      <Choice label={i18n._(labels.seriesIn)} value={spec.seriesIn} disabled={busy}
        options={[{ value: 'columns', label: i18n._(labels.columns) },
          { value: 'rows', label: i18n._(labels.rows) }]}
        onChange={(seriesIn) => patch({ seriesIn })} />
      <Toggle label={i18n._(labels.headerRow)} checked={spec.headerRow} disabled={busy}
        onChange={(headerRow) => patch({ headerRow })} />
      <Toggle label={i18n._(labels.headerCol)} checked={spec.headerCol} disabled={busy}
        onChange={(headerCol) => patch({ headerCol })} />
      <TextField label={i18n._(labels.title)} value={spec.title} disabled={busy}
        onCommit={(title) => patch({ title })} />
      <Choice label={i18n._(labels.legend)} value={spec.legend} disabled={busy}
        options={options(LEGEND_POSITIONS, legendLabels)}
        onChange={(legend) => patch({ legend })} />
      {supportsStack(spec.type) && <Choice label={i18n._(labels.stack)} value={spec.stack}
        disabled={busy} options={options(STACK_MODES, stackLabels)}
        onChange={(stack) => patch({ stack })} />}
      <Toggle label={i18n._(labels.dataLabels)} checked={spec.dataLabels} disabled={busy}
        onChange={(dataLabels) => patch({ dataLabels })} />
      {hasAxes(spec.type) && spec.type !== 'scatter' && <Choice label={i18n._(labels.emptyCells)}
        value={spec.emptyCells} disabled={busy} options={options(EMPTY_CELL_MODES, emptyCellLabels)}
        onChange={(emptyCells) => patch({ emptyCells })} />}
      <Toggle label={i18n._(labels.showHidden)} checked={spec.showHidden} disabled={busy}
        onChange={(showHidden) => patch({ showHidden })} />
      {hasAxes(spec.type) && <>
        <Toggle label={i18n._(labels.gridlines)} checked={spec.gridlines} disabled={busy}
          onChange={(gridlines) => patch({ gridlines })} />
        <TextField label={i18n._(labels.xTitle)} value={spec.xTitle} disabled={busy}
          onCommit={(xTitle) => patch({ xTitle })} />
        <TextField label={i18n._(labels.yTitle)} value={spec.yTitle} disabled={busy}
          onCommit={(yTitle) => patch({ yTitle })} />
        {spec.stack !== 'percent' && <>
          <NumberField label={i18n._(labels.yMin)} value={spec.yMin} disabled={busy}
            placeholder={i18n._(labels.auto)} onCommit={(yMin) => patch({ yMin })} />
          <NumberField label={i18n._(labels.yMax)} value={spec.yMax} disabled={busy}
            placeholder={i18n._(labels.auto)} onCommit={(yMax) => patch({ yMax })} />
        </>}
      </>}
      <ChartStyleFields drawing={panel.drawing} spec={spec} disabled={busy} patch={patch} />
      <ChartExportActions drawing={panel.drawing} />
    </aside>
  )
}
