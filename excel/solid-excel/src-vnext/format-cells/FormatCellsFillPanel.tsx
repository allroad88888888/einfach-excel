/** @jsxImportSource solid-js */

import type { FormatCellsDraft } from '@einfach/spreadsheet-ui-core'
import type { FormatCellsPanelProps } from './format-cells-panel-types'

export function FormatCellsFillPanel(props: FormatCellsPanelProps) {
  return (
    <div class="format-cells-section" data-testid="format-cells-fill">
      <label class="format-cells-row">
        <span>{props.t('formatCells.fill.color')}</span>
        <input
          type="color"
          data-testid="format-cells-bg-color"
          value={props.draft()?.bgColor ?? '#ffffff'}
          onInput={(event) => props.patch({ bgColor: event.currentTarget.value })}
        />
      </label>
      <label class="format-cells-row">
        <span>{props.t('formatCells.fill.pattern')}</span>
        <select
          data-testid="format-cells-pattern"
          value={props.draft()?.fillPattern ?? 'solid'}
          onChange={(event) =>
            props.patch({
              fillPattern: event.currentTarget.value as FormatCellsDraft['fillPattern'],
            })
          }
        >
          <option value="solid">{props.t('formatCells.fill.patternSolid')}</option>
          <option value="lined">{props.t('formatCells.fill.patternLined')}</option>
          <option value="dotted">{props.t('formatCells.fill.patternDotted')}</option>
          <option value="crosshatch">{props.t('formatCells.fill.patternCross')}</option>
        </select>
      </label>
      <label class="format-cells-row">
        <span>{props.t('formatCells.fill.gradientFrom')}</span>
        <input
          type="color"
          data-testid="format-cells-gradient-from"
          value={props.draft()?.fillGradient?.from ?? '#ffffff'}
          onInput={(event) => {
            const from = event.currentTarget.value
            props.patch({
              fillGradient: {
                ...(props.draft()?.fillGradient ?? { to: '#000000', angle: 0 }),
                from,
              },
            })
          }}
        />
      </label>
      <label class="format-cells-row">
        <span>{props.t('formatCells.fill.gradientTo')}</span>
        <input
          type="color"
          data-testid="format-cells-gradient-to"
          value={props.draft()?.fillGradient?.to ?? '#000000'}
          onInput={(event) => {
            const to = event.currentTarget.value
            props.patch({
              fillGradient: {
                ...(props.draft()?.fillGradient ?? { from: '#ffffff', angle: 0 }),
                to,
              },
            })
          }}
        />
      </label>
      <label class="format-cells-row">
        <span>{props.t('formatCells.fill.gradientAngle')}</span>
        <select
          data-testid="format-cells-gradient-angle"
          value={String(props.draft()?.fillGradient?.angle ?? 0)}
          onChange={(event) => {
            const angle = Number(event.currentTarget.value) as 0 | 45 | 90 | 180
            props.patch({
              fillGradient: {
                ...(props.draft()?.fillGradient ?? { from: '#ffffff', to: '#000000' }),
                angle,
              },
            })
          }}
        >
          <option value="0">0</option>
          <option value="45">45</option>
          <option value="90">90</option>
          <option value="180">180</option>
        </select>
      </label>
    </div>
  )
}
