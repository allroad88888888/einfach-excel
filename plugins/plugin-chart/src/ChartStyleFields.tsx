import { useLingui } from '@lingui/react'
import type { SheetDrawing } from '@einfach-excel/spreadsheet-ui-core'
import {
  chartTheme,
  colorSlots,
  defaultSlotColor,
  MAX_CHART_FONT_SIZE,
  MIN_CHART_FONT_SIZE,
  withPalette,
  type ChartSpec,
} from './core'
import { designLabels } from './design-messages'
import { labels } from './messages'
import { ColorField, NumberField, Toggle } from './settings-fields'
import { useChartOption } from './use-chart-option'

const MAX_COLOR_FIELDS = 12

/** 外观、字号与配色：支持深色卡片预设，普通图按系列取色，饼图按扇区取色。 */
export function ChartStyleFields({
  drawing,
  spec,
  disabled,
  patch,
}: {
  readonly drawing: SheetDrawing
  readonly spec: ChartSpec
  readonly disabled: boolean
  readonly patch: (value: Partial<ChartSpec>) => void
}) {
  const { i18n } = useLingui()
  const { data } = useChartOption(drawing)
  const slots = colorSlots(spec, data)
  const palette = withPalette(chartTheme(spec.dark), spec.palette).palette
  const setColor = (index: number, color: string) => {
    const colors = Array.from(
      { length: Math.max(spec.colors.length, index + 1) },
      (_, at) => spec.colors[at] ?? null,
    )
    colors[index] = color
    patch({ colors })
  }
  return (
    <>
      <Toggle
        label={i18n._(designLabels.darkMode)}
        checked={spec.dark}
        disabled={disabled}
        onChange={(dark) => patch({ dark })}
      />
      <NumberField
        label={i18n._(labels.fontSize)}
        value={spec.fontSize}
        disabled={disabled}
        placeholder="12"
        onCommit={(fontSize) =>
          patch({
            fontSize:
              fontSize === null
                ? null
                : Math.round(
                    Math.min(MAX_CHART_FONT_SIZE, Math.max(MIN_CHART_FONT_SIZE, fontSize)),
                  ),
          })
        }
      />
      <fieldset className="plugin-chart-colors" disabled={disabled}>
        <legend>{i18n._(labels.colors)}</legend>
        {slots.slice(0, MAX_COLOR_FIELDS).map((slot, index) => (
          <ColorField
            key={index}
            label={(slot.role ? i18n._(labels[slot.role]) : slot.name) || '—'}
            disabled={disabled}
            value={spec.colors[index] ?? defaultSlotColor(spec, index, palette)}
            onCommit={(color) => setColor(index, color)}
          />
        ))}
        {spec.colors.some(Boolean) && (
          <button type="button" onClick={() => patch({ colors: [] })}>
            {i18n._(labels.resetColors)}
          </button>
        )}
      </fieldset>
    </>
  )
}
