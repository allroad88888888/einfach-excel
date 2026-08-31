/** @jsxImportSource solid-js */

import { For } from 'solid-js'
import type {
  FormatCellsDraft,
  SpreadsheetAlignment,
  SpreadsheetVerticalAlignment,
} from '@einfach/spreadsheet-ui-core'
import { HORIZONTAL_ALIGNS, VERTICAL_ALIGNS } from './format-cells-config'
import type { FormatCellsPanelProps } from './format-cells-panel-types'

function integerInput(event: InputEvent & { currentTarget: HTMLInputElement }): number {
  return Math.round(Number(event.currentTarget.value) || 0)
}

export function FormatCellsAlignmentPanel(props: FormatCellsPanelProps) {
  return (
    <div class="format-cells-section" data-testid="format-cells-alignment">
      <label class="format-cells-row">
        <span>{props.t('formatCells.alignment.horizontal')}</span>
        <select
          data-testid="format-cells-align-horizontal"
          value={props.draft()?.align ?? 'default'}
          onChange={(event) =>
            props.patch({ align: event.currentTarget.value as SpreadsheetAlignment })
          }
        >
          <option value="default">{props.t('formatCells.alignment.default')}</option>
          <For each={HORIZONTAL_ALIGNS}>
            {(value) => (
              <option value={value}>{props.t(`formatCells.alignment.h.${value}`)}</option>
            )}
          </For>
        </select>
      </label>
      <label class="format-cells-row">
        <span>{props.t('formatCells.alignment.vertical')}</span>
        <select
          data-testid="format-cells-align-vertical"
          value={props.draft()?.verticalAlign ?? 'bottom'}
          onChange={(event) =>
            props.patch({
              verticalAlign: event.currentTarget.value as SpreadsheetVerticalAlignment,
            })
          }
        >
          <For each={VERTICAL_ALIGNS}>
            {(value) => (
              <option value={value}>{props.t(`formatCells.alignment.v.${value}`)}</option>
            )}
          </For>
        </select>
      </label>
      <label class="format-cells-row">
        <span>{props.t('formatCells.alignment.rotation')}</span>
        <input
          type="number"
          min="-90"
          max="90"
          data-testid="format-cells-rotation"
          value={props.draft()?.rotation ?? 0}
          onInput={(event) =>
            props.patch({ rotation: Math.max(-90, Math.min(90, integerInput(event))) })
          }
        />
      </label>
      <label class="format-cells-row">
        <input
          type="checkbox"
          data-testid="format-cells-wrap"
          checked={!!props.draft()?.wrap}
          onChange={(event) => props.patch({ wrap: event.currentTarget.checked })}
        />
        <span>{props.t('formatCells.alignment.wrap')}</span>
      </label>
      <label class="format-cells-row">
        <input
          type="checkbox"
          data-testid="format-cells-shrink"
          checked={!!props.draft()?.shrinkToFit}
          onChange={(event) => props.patch({ shrinkToFit: event.currentTarget.checked })}
        />
        <span>{props.t('formatCells.alignment.shrink')}</span>
      </label>
      <label class="format-cells-row">
        <span>{props.t('formatCells.alignment.indent')}</span>
        <input
          type="number"
          min="0"
          max="20"
          data-testid="format-cells-indent"
          value={props.draft()?.indent ?? 0}
          onInput={(event) => props.patch({ indent: Math.max(0, integerInput(event)) })}
        />
      </label>
      <label class="format-cells-row">
        <span>{props.t('formatCells.alignment.direction')}</span>
        <select
          data-testid="format-cells-text-direction"
          value={props.draft()?.textDirection ?? 'context'}
          onChange={(event) =>
            props.patch({
              textDirection: event.currentTarget.value as FormatCellsDraft['textDirection'],
            })
          }
        >
          <option value="context">{props.t('formatCells.alignment.direction.context')}</option>
          <option value="ltr">{props.t('formatCells.alignment.direction.ltr')}</option>
          <option value="rtl">{props.t('formatCells.alignment.direction.rtl')}</option>
        </select>
      </label>
    </div>
  )
}
