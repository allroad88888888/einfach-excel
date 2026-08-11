/** @jsxImportSource solid-js */

import { For, type Accessor } from 'solid-js'
import type { FormatCellsTabId } from '@einfach/spreadsheet-ui-core'
import { FORMAT_CELLS_TABS } from './format-cells-config'

interface FormatCellsTabsProps {
  readonly activeTab: Accessor<FormatCellsTabId>
  readonly setTab: (tab: FormatCellsTabId) => void
  readonly t: (id: string, values?: Record<string, unknown>) => string
}

function nextTab(current: FormatCellsTabId, key: string): FormatCellsTabId | null {
  const index = FORMAT_CELLS_TABS.findIndex((tab) => tab.id === current)
  if (key === 'Home') return FORMAT_CELLS_TABS[0].id
  if (key === 'End') return FORMAT_CELLS_TABS[FORMAT_CELLS_TABS.length - 1].id
  if (key !== 'ArrowRight' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowUp') {
    return null
  }
  const step = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1
  return FORMAT_CELLS_TABS[(index + step + FORMAT_CELLS_TABS.length) % FORMAT_CELLS_TABS.length].id
}

export function FormatCellsTabs(props: FormatCellsTabsProps) {
  function onKeyDown(event: KeyboardEvent): void {
    const id = nextTab(props.activeTab(), event.key)
    if (!id) return
    event.preventDefault()
    props.setTab(id)
    queueMicrotask(() => document.getElementById(`format-cells-tab-${id}`)?.focus())
  }

  return (
    <div
      class="format-cells-tabs"
      role="tablist"
      aria-labelledby="format-cells-title"
      data-testid="format-cells-tabs"
      onKeyDown={onKeyDown}
    >
      <For each={FORMAT_CELLS_TABS}>
        {(tab) => (
          <button
            type="button"
            id={`format-cells-tab-${tab.id}`}
            role="tab"
            class={`format-cells-tab ${props.activeTab() === tab.id ? 'format-cells-tab-active' : ''}`.trim()}
            data-testid={`format-cells-tab-${tab.id}`}
            aria-controls={`format-cells-panel-${tab.id}`}
            aria-selected={props.activeTab() === tab.id}
            tabIndex={props.activeTab() === tab.id ? 0 : -1}
            onClick={() => props.setTab(tab.id)}
          >
            {props.t(tab.labelKey)}
          </button>
        )}
      </For>
    </div>
  )
}
