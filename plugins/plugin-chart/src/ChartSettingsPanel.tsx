import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { useEffect, useId, useRef } from 'react'
import {
  ALL_CHART_TYPES,
  chartSettingsAtom,
  EMPTY_CELL_MODES,
  hasAxes,
  hasDataLabels,
  hasLegend,
  LEGEND_POSITIONS,
  STACK_MODES,
  supportsAnalysis,
  supportsStack,
  updateChartSettingsAtom,
  usesEmptyCells,
  type ChartSpec,
} from './core'
import { emptyCellLabels, labels, legendLabels, stackLabels, typeLabels } from './messages'
import { Choice, NumberField, TextField, Toggle } from './settings-fields'
import { ChartDesignFields } from './ChartDesignFields'
import { ChartExportActions } from './ChartExportActions'
import { ChartStyleFields } from './ChartStyleFields'
import { ComboSeriesFields } from './ComboSeriesFields'
import { ErrorBarFields } from './ErrorBarFields'
import { TrendlineFields } from './TrendlineFields'

/** 非模态侧栏：改动立即生效，支持双击图表具体元素直达对应设置分组并聚焦控件。 */
export function ChartSettingsPanel() {
  const { i18n } = useLingui()
  const panel = useAtomValue(chartSettingsAtom)
  const update = useSetAtom(updateChartSettingsAtom)
  const asideRef = useRef<HTMLElement>(null)
  const id = useId()
  const activeSection = panel.open ? panel.section : null
  const focusSeq = panel.open ? panel.focusSeq : 0

  useEffect(() => {
    if (!panel.open || !activeSection) return
    const sectionEl = asideRef.current?.querySelector<HTMLElement>(
      `[data-chart-section="${activeSection}"]`,
    )
    if (!sectionEl) return
    sectionEl.scrollIntoView?.({ block: 'nearest' })
    const control =
      sectionEl.querySelector<HTMLElement>('input[type="text"]:not(:disabled)') ??
      sectionEl.querySelector<HTMLElement>(
        'select:not(:disabled), input:not(:disabled), button:not(:disabled)',
      )
    control?.focus({ preventScroll: true })
  }, [panel.open, activeSection, focusSeq])

  if (!panel.open) return null
  const { spec, busy } = panel
  const patch = (value: Partial<ChartSpec>) => void update({ type: 'spec', patch: value })
  const options = <T extends string>(
    values: readonly T[],
    names: Record<T, { id: string; message: string }>,
  ) => values.map((value) => ({ value, label: i18n._(names[value]) }))
  return (
    <aside
      ref={asideRef}
      className="plugin-chart-settings"
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${id}-title`}
      data-chart-id={panel.drawing.id}
      data-active-section={activeSection ?? undefined}
      onKeyDown={(event) => {
        if (event.key === 'Escape') void update({ type: 'close' })
      }}
    >
      <header>
        <h2 id={`${id}-title`}>{i18n._(labels.settings)}</h2>
        <button
          type="button"
          aria-label={i18n._(labels.close)}
          onClick={() => void update({ type: 'close' })}
        >
          ×
        </button>
      </header>
      <Choice
        label={i18n._(labels.type)}
        value={spec.type}
        disabled={busy}
        options={options(ALL_CHART_TYPES, typeLabels)}
        onChange={(type) => patch({ type, ...(supportsStack(type) ? {} : { stack: 'none' }) })}
      />
      <ChartDesignFields spec={spec} disabled={busy} patch={patch} />
      <div className="plugin-chart-field">
        <label htmlFor={`${id}-range`}>{i18n._(labels.range)}</label>
        <div className="plugin-chart-range">
          <input
            id={`${id}-range`}
            type="text"
            value={panel.rangeDraft}
            disabled={busy}
            spellCheck={false}
            onChange={(event) =>
              void update({ type: 'rangeDraft', text: event.currentTarget.value })
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') void update({ type: 'applyRange' })
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void update({ type: 'applyRange' })}
          >
            {i18n._(labels.applyRange)}
          </button>
        </div>
      </div>
      {panel.error && (
        <p className="plugin-chart-error" role="alert">
          {i18n._({ id: panel.error, message: panel.error })}
        </p>
      )}
      <Choice
        label={i18n._(labels.seriesIn)}
        value={spec.seriesIn}
        disabled={busy}
        options={[
          { value: 'columns', label: i18n._(labels.columns) },
          { value: 'rows', label: i18n._(labels.rows) },
        ]}
        onChange={(seriesIn) => patch({ seriesIn })}
      />
      <Toggle
        label={i18n._(labels.headerRow)}
        checked={spec.headerRow}
        disabled={busy}
        onChange={(headerRow) => patch({ headerRow })}
      />
      <Toggle
        label={i18n._(labels.headerCol)}
        checked={spec.headerCol}
        disabled={busy}
        onChange={(headerCol) => patch({ headerCol })}
      />
      <div
        className="plugin-chart-section"
        data-chart-section="title"
        data-section-active={activeSection === 'title' || undefined}
      >
        <TextField
          label={i18n._(labels.title)}
          value={spec.title}
          disabled={busy}
          onCommit={(title) => patch({ title })}
        />
      </div>
      {hasLegend(spec.type) && (
        <div
          className="plugin-chart-section"
          data-chart-section="legend"
          data-section-active={activeSection === 'legend' || undefined}
        >
          <Choice
            label={i18n._(labels.legend)}
            value={spec.legend}
            disabled={busy}
            options={options(LEGEND_POSITIONS, legendLabels)}
            onChange={(legend) => patch({ legend })}
          />
        </div>
      )}
      {usesEmptyCells(spec.type) && (
        <Choice
          label={i18n._(labels.emptyCells)}
          value={spec.emptyCells}
          disabled={busy}
          options={options(EMPTY_CELL_MODES, emptyCellLabels)}
          onChange={(emptyCells) => patch({ emptyCells })}
        />
      )}
      <Toggle
        label={i18n._(labels.showHidden)}
        checked={spec.showHidden}
        disabled={busy}
        onChange={(showHidden) => patch({ showHidden })}
      />
      {hasAxes(spec.type) && (
        <div
          className="plugin-chart-section"
          data-chart-section="axis"
          data-section-active={activeSection === 'axis' || undefined}
        >
          <Toggle
            label={i18n._(labels.gridlines)}
            checked={spec.gridlines}
            disabled={busy}
            onChange={(gridlines) => patch({ gridlines })}
          />
          <TextField
            label={i18n._(labels.xTitle)}
            value={spec.xTitle}
            disabled={busy}
            onCommit={(xTitle) => patch({ xTitle })}
          />
          <TextField
            label={i18n._(labels.yTitle)}
            value={spec.yTitle}
            disabled={busy}
            onCommit={(yTitle) => patch({ yTitle })}
          />
          {spec.stack !== 'percent' && (
            <>
              <NumberField
                label={i18n._(labels.yMin)}
                value={spec.yMin}
                disabled={busy}
                placeholder={i18n._(labels.auto)}
                onCommit={(yMin) => patch({ yMin })}
              />
              <NumberField
                label={i18n._(labels.yMax)}
                value={spec.yMax}
                disabled={busy}
                placeholder={i18n._(labels.auto)}
                onCommit={(yMax) => patch({ yMax })}
              />
            </>
          )}
        </div>
      )}
      {supportsAnalysis(spec) && (
        <>
          <TrendlineFields drawing={panel.drawing} spec={spec} disabled={busy} patch={patch} />
          <ErrorBarFields spec={spec} disabled={busy} patch={patch} />
        </>
      )}
      <div
        className="plugin-chart-section"
        data-chart-section="series"
        data-section-active={activeSection === 'series' || undefined}
      >
        {spec.type === 'combo' && (
          <ComboSeriesFields drawing={panel.drawing} spec={spec} disabled={busy} patch={patch} />
        )}
        {supportsStack(spec.type) && (
          <Choice
            label={i18n._(labels.stack)}
            value={spec.stack}
            disabled={busy}
            options={options(STACK_MODES, stackLabels)}
            onChange={(stack) => patch({ stack })}
          />
        )}
        {hasDataLabels(spec.type) && (
          <Toggle
            label={i18n._(labels.dataLabels)}
            checked={spec.dataLabels}
            disabled={busy}
            onChange={(dataLabels) => patch({ dataLabels })}
          />
        )}
        <ChartStyleFields drawing={panel.drawing} spec={spec} disabled={busy} patch={patch} />
      </div>
      <ChartExportActions drawing={panel.drawing} />
    </aside>
  )
}
