/** @jsxImportSource solid-js */

import { For, Show, type Accessor } from 'solid-js'
import type { FormatCellsNumberCategory } from '@einfach/spreadsheet-ui-core'
import { NUMBER_CATEGORIES, SUPPORTED_CATEGORIES } from './format-cells-config'
import type { FormatCellsPanelProps } from './format-cells-panel-types'

interface FormatCellsNumberPanelProps extends FormatCellsPanelProps {
  readonly category: Accessor<FormatCellsNumberCategory>
  readonly preview: Accessor<string>
  readonly setCategory: (category: FormatCellsNumberCategory) => void
}

export function FormatCellsNumberPanel(props: FormatCellsNumberPanelProps) {
  return (
    <div class="format-cells-section" data-testid="format-cells-number">
      <ul class="format-cells-category-list" data-testid="format-cells-category-list">
        <For each={NUMBER_CATEGORIES}>
          {(category) => (
            <li>
              <label class="format-cells-category-row">
                <input
                  type="radio"
                  name="format-cells-category"
                  data-testid={`format-cells-category-${category}`}
                  checked={props.category() === category}
                  disabled={!SUPPORTED_CATEGORIES.has(category)}
                  onChange={() => props.setCategory(category)}
                />
                <span>{props.t(`formatCells.number.category.${category}`)}</span>
                <Show when={!SUPPORTED_CATEGORIES.has(category)}>
                  <span
                    class="format-cells-coming-soon"
                    data-testid={`format-cells-category-${category}-coming-soon`}
                  >
                    {props.t('formatCells.number.comingSoon')}
                  </span>
                </Show>
              </label>
            </li>
          )}
        </For>
      </ul>
      <output
        class="format-cells-preview"
        data-testid="format-cells-number-preview"
        aria-live="polite"
      >
        {props.preview()}
      </output>
      <Show when={props.category() === 'number'}>
        <label class="format-cells-row">
          <span>{props.t('formatCells.number.decimals')}</span>
          <input
            type="number"
            min="0"
            max="20"
            data-testid="format-cells-number-decimals"
            value={(() => {
              const format = props.draft()?.numberFormat
              return format && 'digits' in format ? (format.digits ?? 2) : 2
            })()}
            onInput={(event) => {
              const digits = Math.max(
                0,
                Math.min(20, Math.round(Number(event.currentTarget.value) || 0)),
              )
              props.patch({ numberFormat: { kind: 'decimal', digits } })
            }}
          />
        </label>
      </Show>
      <Show when={props.category() === 'currency'}>
        <label class="format-cells-row">
          <span>{props.t('formatCells.number.symbol')}</span>
          <input
            type="text"
            data-testid="format-cells-currency-symbol"
            value={(() => {
              const format = props.draft()?.numberFormat
              return format?.kind === 'currency' ? (format.symbol ?? '$') : '$'
            })()}
            onInput={(event) => {
              const current = props.draft()?.numberFormat
              const digits = current?.kind === 'currency' ? (current.digits ?? 2) : 2
              props.patch({
                numberFormat: { kind: 'currency', symbol: event.currentTarget.value, digits },
              })
            }}
          />
        </label>
      </Show>
      <Show when={props.category() === 'date'}>
        <label class="format-cells-row">
          <span>{props.t('formatCells.number.pattern')}</span>
          <input
            type="text"
            data-testid="format-cells-date-pattern"
            value={(() => {
              const format = props.draft()?.numberFormat
              return format?.kind === 'date' ? (format.pattern ?? 'yyyy-MM-dd') : 'yyyy-MM-dd'
            })()}
            onInput={(event) =>
              props.patch({ numberFormat: { kind: 'date', pattern: event.currentTarget.value } })
            }
          />
        </label>
      </Show>
    </div>
  )
}
