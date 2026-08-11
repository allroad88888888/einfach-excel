/** @jsxImportSource solid-js */

import { For } from 'solid-js'
import { FONT_FAMILIES } from './format-cells-config'
import type { FormatCellsPanelProps } from './format-cells-panel-types'

export function FormatCellsFontPanel(props: FormatCellsPanelProps) {
  return (
    <div class="format-cells-section" data-testid="format-cells-font">
      <label class="format-cells-row">
        <span>{props.t('formatCells.font.family')}</span>
        <select
          data-testid="format-cells-font-family"
          value={props.draft()?.fontFamily ?? ''}
          onChange={(event) => props.patch({ fontFamily: event.currentTarget.value || undefined })}
        >
          <option value="">{props.t('formatCells.font.familyDefault')}</option>
          <For each={FONT_FAMILIES}>{(family) => <option value={family}>{family}</option>}</For>
        </select>
      </label>
      <label class="format-cells-row">
        <span>{props.t('formatCells.font.size')}</span>
        <input
          type="number"
          min="1"
          max="409"
          data-testid="format-cells-font-size"
          value={props.draft()?.fontSize ?? 12}
          onInput={(event) =>
            props.patch({
              fontSize: Math.max(1, Math.round(Number(event.currentTarget.value) || 0)),
            })
          }
        />
      </label>
      <label class="format-cells-row">
        <input
          type="checkbox"
          data-testid="format-cells-bold"
          checked={!!props.draft()?.bold}
          onChange={(event) => props.patch({ bold: event.currentTarget.checked })}
        />
        <span>{props.t('formatCells.font.bold')}</span>
      </label>
      <label class="format-cells-row">
        <input
          type="checkbox"
          data-testid="format-cells-italic"
          checked={!!props.draft()?.italic}
          onChange={(event) => props.patch({ italic: event.currentTarget.checked })}
        />
        <span>{props.t('formatCells.font.italic')}</span>
      </label>
      <label class="format-cells-row">
        <input
          type="checkbox"
          data-testid="format-cells-underline"
          checked={!!props.draft()?.underline}
          onChange={(event) => props.patch({ underline: event.currentTarget.checked })}
        />
        <span>{props.t('formatCells.font.underline')}</span>
      </label>
      <label class="format-cells-row">
        <input
          type="checkbox"
          data-testid="format-cells-strikethrough"
          checked={!!props.draft()?.strikethrough}
          onChange={(event) => props.patch({ strikethrough: event.currentTarget.checked })}
        />
        <span>{props.t('formatCells.font.strikethrough')}</span>
      </label>
      <label class="format-cells-row">
        <span>{props.t('formatCells.font.color')}</span>
        <input
          type="color"
          data-testid="format-cells-fg-color"
          value={props.draft()?.fgColor ?? '#000000'}
          onInput={(event) => props.patch({ fgColor: event.currentTarget.value })}
        />
      </label>
      <label class="format-cells-row">
        <span>{props.t('formatCells.font.script')}</span>
        <select
          data-testid="format-cells-script"
          value={props.draft()?.verticalScript ?? 'none'}
          onChange={(event) => {
            const value = event.currentTarget.value
            props.patch({
              verticalScript: value === 'none' ? undefined : (value as 'superscript' | 'subscript'),
            })
          }}
        >
          <option value="none">{props.t('formatCells.font.scriptNone')}</option>
          <option value="superscript">{props.t('formatCells.font.scriptSuper')}</option>
          <option value="subscript">{props.t('formatCells.font.scriptSub')}</option>
        </select>
      </label>
    </div>
  )
}
