import { For, onCleanup, onMount, Show } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import {
  sheetTabsAtom,
  sheetTabsSheetsAtom,
  workspaceSessionAtom,
} from '@einfach/spreadsheet-ui-core'

import { useSpreadsheetBackend, useSpreadsheetUiStore } from '../provider'
import { SpreadsheetSheetTabActions } from './SpreadsheetSheetTabActions'
import { SpreadsheetSheetTabItem } from './SpreadsheetSheetTabItem'
import { SpreadsheetSheetTabOverlays } from './SpreadsheetSheetTabOverlays'
import { SpreadsheetSheetTabRenameEditor } from './SpreadsheetSheetTabRenameEditor'
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
      class={`spreadsheet-sheet-tabs ${props.class ?? ''}`.trim()}
      data-testid={props['data-testid'] ?? 'spreadsheet-sheet-tabs'}
      aria-busy={sheetTabs().phase === 'loading' || sheetTabs().mutation !== null}
    >
      <Show when={sheetTabs().phase === 'loading'}>
        <span role="status" data-testid="sheet-tabs-loading">
          Loading sheets…
        </span>
      </Show>
      <div
        class="spreadsheet-sheet-tab-list"
        role="tablist"
        aria-label="Workbook sheets"
        style={{ display: 'flex', 'align-items': 'stretch' }}
      >
        <For each={sheets()}>
          {(sheet) => (
            <SpreadsheetSheetTabItem
              sheet={sheet}
              active={() => workspace().activeSheetId === sheet.id}
              reordering={() => sheetTabs().reorder?.sheetId === sheet.id}
              reorderDropSide={() => controller.reorderDropSide(sheet.id)}
              controller={controller}
            />
          )}
        </For>
      </div>
      <SpreadsheetSheetTabRenameEditor
        sheetTabs={sheetTabs}
        sheets={sheets}
        controller={controller}
      />
      <SpreadsheetSheetTabActions sheets={sheets} controller={controller} />
      <SpreadsheetSheetTabOverlays sheetTabs={sheetTabs} sheets={sheets} controller={controller} />
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
