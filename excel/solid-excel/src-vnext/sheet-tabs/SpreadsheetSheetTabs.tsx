import { For, onCleanup, onMount, Show } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import {
  sheetTabsAtom,
  sheetTabsSheetsAtom,
  workspaceSessionAtom,
} from '@einfach/spreadsheet-ui-core'

import { useSpreadsheetBackend, useSpreadsheetUiStore } from '../provider'
import { SpreadsheetSheetTabItem } from './SpreadsheetSheetTabItem'
import { SpreadsheetSheetTabOverlays } from './SpreadsheetSheetTabOverlays'
import { createSheetTabInteractionController } from './sheet-tab-controller'

export interface SpreadsheetSheetMetadataInput {
  id: string
  name: string
  index?: number
}

export interface SpreadsheetSheetTabsProps {
  sheets: readonly SpreadsheetSheetMetadataInput[]
  class?: string
  'data-testid'?: string
}

/** Renders sheet-tab state owned by the Sheet Tabs core atoms. */
export function SpreadsheetSheetTabs(props: SpreadsheetSheetTabsProps) {
  const backend = useSpreadsheetBackend()
  const store = useSpreadsheetUiStore()
  const workspace = useAtomValue(workspaceSessionAtom)
  const sheetTabs = useAtomValue(sheetTabsAtom)
  const sheets = useAtomValue(sheetTabsSheetsAtom)
  const controller = createSheetTabInteractionController({
    store,
    sheetTabs,
    sheets,
  })

  onMount(() => {
    controller.initialize(backend, props.sheets)
  })

  onCleanup(() => controller.dispose())

  return (
    <div
      class={`sheet-tabs spreadsheet-sheet-tabs ${props.class ?? ''}`.trim()}
      role="tablist"
      data-testid={props['data-testid'] ?? 'spreadsheet-sheet-tabs'}
      aria-busy={sheetTabs().phase === 'loading' || sheetTabs().mutation !== null}
    >
      <Show when={sheetTabs().phase === 'loading'}>
        <span role="status" data-testid="sheet-tabs-loading">
          Loading sheets…
        </span>
      </Show>
      <For each={sheets()}>
        {(sheet) => (
          <SpreadsheetSheetTabItem
            sheet={sheet}
            active={() => workspace().activeSheetId === sheet.id}
            renaming={() => sheetTabs().rename?.sheetId === sheet.id}
            reordering={() => sheetTabs().reorder?.sheetId === sheet.id}
            reorderDropSide={() => controller.reorderDropSide(sheet.id)}
            sheetCount={sheets().length}
            controller={controller}
          />
        )}
      </For>
      <button
        type="button"
        class="sheet-tab-add spreadsheet-sheet-tab-add"
        data-testid="sheet-tab-add"
        aria-label="Add sheet"
        title={controller.commandTitle('add', 'Add sheet')}
        disabled={controller.commandDisabled('add')}
        onClick={() => controller.addSheet()}
      >
        +
      </button>
      <SpreadsheetSheetTabOverlays
        sheetTabs={sheetTabs}
        sheets={sheets}
        controller={controller}
      />
      <Show when={sheetTabs().error}>
        {(error) => (
          <span role="alert" data-testid="sheet-tabs-error">
            {error()}
          </span>
        )}
      </Show>
    </div>
  )
}
