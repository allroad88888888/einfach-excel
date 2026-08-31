/** @jsxImportSource solid-js */

import { For } from 'solid-js'
import type { SpreadsheetBorderStyle } from '@einfach/spreadsheet-ui-core'
import { BORDER_STYLES } from './format-cells-config'
import type { FormatCellsPanelProps } from './format-cells-panel-types'

const BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const
type BorderSide = (typeof BORDER_SIDES)[number]

export function FormatCellsBorderPanel(props: FormatCellsPanelProps) {
  function clearBorders(): void {
    props.patch({ borders: undefined })
  }

  function outlineBorders(): void {
    const border = { style: 'thin' as const }
    props.patch({ borders: { top: border, right: border, bottom: border, left: border } })
  }

  function toggleSide(side: BorderSide): void {
    const next = { ...(props.draft()?.borders ?? {}) }
    if (next[side]) delete next[side]
    else next[side] = { style: 'thin' }
    props.patch({ borders: next })
  }

  function updateActiveBorders(
    update: { style: SpreadsheetBorderStyle } | { color: string },
  ): void {
    const next = { ...(props.draft()?.borders ?? {}) }
    for (const side of BORDER_SIDES) {
      if (next[side]) next[side] = { ...next[side], ...update }
    }
    props.patch({ borders: next })
  }

  const selectedStyle = () => {
    const borders = props.draft()?.borders
    return borders?.top?.style ?? borders?.left?.style ?? 'thin'
  }
  const selectedColor = () => {
    const borders = props.draft()?.borders
    return borders?.top?.color ?? borders?.left?.color ?? '#000000'
  }

  return (
    <div class="format-cells-section" data-testid="format-cells-border">
      <div class="format-cells-row">
        <button type="button" data-testid="format-cells-border-preset-none" onClick={clearBorders}>
          {props.t('formatCells.border.none')}
        </button>
        <button
          type="button"
          data-testid="format-cells-border-preset-outline"
          onClick={outlineBorders}
        >
          {props.t('formatCells.border.outline')}
        </button>
      </div>
      <div class="format-cells-row">
        <For each={BORDER_SIDES}>
          {(side) => (
            <button
              type="button"
              data-testid={`format-cells-border-side-${side}`}
              class={
                props.draft()?.borders?.[side] ? 'format-cells-side-active' : 'format-cells-side'
              }
              aria-pressed={!!props.draft()?.borders?.[side]}
              onClick={() => toggleSide(side)}
            >
              {props.t(`formatCells.border.side.${side}`)}
            </button>
          )}
        </For>
      </div>
      <label class="format-cells-row">
        <span>{props.t('formatCells.border.style')}</span>
        <select
          data-testid="format-cells-border-style"
          value={selectedStyle()}
          onChange={(event) =>
            updateActiveBorders({ style: event.currentTarget.value as SpreadsheetBorderStyle })
          }
        >
          <For each={BORDER_STYLES}>{(value) => <option value={value}>{value}</option>}</For>
        </select>
      </label>
      <label class="format-cells-row">
        <span>{props.t('formatCells.border.color')}</span>
        <input
          type="color"
          data-testid="format-cells-border-color"
          value={selectedColor()}
          onInput={(event) => updateActiveBorders({ color: event.currentTarget.value })}
        />
      </label>
      <div
        class="format-cells-border-preview"
        data-testid="format-cells-border-preview"
        style={{
          'border-top': props.draft()?.borders?.top
            ? '1px solid var(--text-default)'
            : '1px dashed var(--border-strong)',
          'border-right': props.draft()?.borders?.right
            ? '1px solid var(--text-default)'
            : '1px dashed var(--border-strong)',
          'border-bottom': props.draft()?.borders?.bottom
            ? '1px solid var(--text-default)'
            : '1px dashed var(--border-strong)',
          'border-left': props.draft()?.borders?.left
            ? '1px solid var(--text-default)'
            : '1px dashed var(--border-strong)',
        }}
      >
        {props.t('formatCells.border.previewText')}
      </div>
    </div>
  )
}
