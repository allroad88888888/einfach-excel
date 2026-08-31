/** @jsxImportSource solid-js */

import { For, Match, Show, Switch, type Accessor } from 'solid-js'
import type { FormatCellsNumberCategory, FormatCellsTabId } from '@einfach/spreadsheet-ui-core'
import { FormatCellsAlignmentPanel } from './FormatCellsAlignmentPanel'
import { FormatCellsBorderPanel } from './FormatCellsBorderPanel'
import { FormatCellsFillPanel } from './FormatCellsFillPanel'
import { FormatCellsFontPanel } from './FormatCellsFontPanel'
import { FormatCellsNumberPanel } from './FormatCellsNumberPanel'
import { FORMAT_CELLS_TABS } from './format-cells-config'
import type { FormatCellsPanelProps } from './format-cells-panel-types'

interface FormatCellsActivePanelProps extends FormatCellsPanelProps {
  readonly activeTab: Accessor<FormatCellsTabId>
  readonly category: Accessor<FormatCellsNumberCategory>
  readonly preview: Accessor<string>
  readonly setCategory: (category: FormatCellsNumberCategory) => void
}

function ActivePanel(props: FormatCellsActivePanelProps) {
  const panelProps = { draft: props.draft, patch: props.patch, t: props.t }

  return (
    <Switch>
      <Match when={props.activeTab() === 'number'}>
        <FormatCellsNumberPanel
          {...panelProps}
          category={props.category}
          preview={props.preview}
          setCategory={props.setCategory}
        />
      </Match>
      <Match when={props.activeTab() === 'alignment'}>
        <FormatCellsAlignmentPanel {...panelProps} />
      </Match>
      <Match when={props.activeTab() === 'font'}>
        <FormatCellsFontPanel {...panelProps} />
      </Match>
      <Match when={props.activeTab() === 'border'}>
        <FormatCellsBorderPanel {...panelProps} />
      </Match>
      <Match when={props.activeTab() === 'fill'}>
        <FormatCellsFillPanel {...panelProps} />
      </Match>
    </Switch>
  )
}

export function FormatCellsPanel(props: FormatCellsActivePanelProps) {
  return (
    <For each={FORMAT_CELLS_TABS}>
      {(tab) => (
        <div
          class="format-cells-panel"
          id={`format-cells-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`format-cells-tab-${tab.id}`}
          tabIndex={props.activeTab() === tab.id ? 0 : -1}
          hidden={props.activeTab() !== tab.id}
          data-testid={`format-cells-panel-${tab.id}`}
        >
          <Show when={props.activeTab() === tab.id}>
            <ActivePanel {...props} />
          </Show>
        </div>
      )}
    </For>
  )
}
