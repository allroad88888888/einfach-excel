import { For, Show } from 'solid-js'
import { type OutlineAxis } from '@einfach/spreadsheet-ui-core'
import { type GridRuntime } from './grid-runtime'

export interface SpreadsheetGridOutlineProps {
  runtime: GridRuntime
  axis: OutlineAxis
  index?: number
}

/** Renders a single outline gutter slot group or its level buttons. */
export function SpreadsheetGridOutline(props: SpreadsheetGridOutlineProps) {
  const { runtime, axis } = props
  const { getOutlineLevelSlots, getOutlineToggleAt, outlineSlotHasLine, toggleOutlineGroup, getOutlineLevelButtons, collapseOutlineLevel } = runtime
  if (props.index === undefined) {
    return (
      <For each={getOutlineLevelButtons(axis)}>
        {(level) => (
          <button
            type="button"
            class="spreadsheet-outline-level-button"
            data-testid={`outline-${axis === 'row' ? 'row' : 'col'}-level-${level}`}
            aria-label={`Show ${axis === 'row' ? 'row' : 'column'} outline level ${level}`}
            onClick={(event) => {
              event.stopPropagation()
              collapseOutlineLevel(axis, level)
            }}
          >
            {level}
          </button>
        )}
      </For>
    )
  }
  return (
    <span class="spreadsheet-outline-slots" data-axis={axis}>
      <For each={getOutlineLevelSlots(axis)}>
        {(level) => {
          const toggle = () => getOutlineToggleAt(axis, props.index!, level)
          return (
            <span class="spreadsheet-outline-slot">
              <Show
                when={toggle()}
                fallback={
                  <Show when={outlineSlotHasLine(axis, props.index!, level)}>
                    <span class="spreadsheet-outline-line" aria-hidden="true" />
                  </Show>
                }
              >
                {(group) => (
                  <button
                    type="button"
                    class="spreadsheet-outline-toggle"
                    data-testid={`outline-${axis === 'row' ? 'row' : 'col'}-toggle-${group().start}-${group().end}`}
                    data-collapsed={group().collapsed ? 'true' : 'false'}
                    aria-expanded={group().collapsed ? 'false' : 'true'}
                    aria-label={`${group().collapsed ? 'Expand' : 'Collapse'} ${axis === 'row' ? 'rows' : 'columns'} ${group().start + 1}-${group().end + 1}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      toggleOutlineGroup(axis, group())
                    }}
                  >
                    {group().collapsed ? '+' : '−'}
                  </button>
                )}
              </Show>
            </span>
          )
        }}
      </For>
    </span>
  )
}
