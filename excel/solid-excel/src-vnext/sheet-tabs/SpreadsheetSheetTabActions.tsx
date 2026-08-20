import { For } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { SpreadsheetSheetMetadata } from '@einfach/spreadsheet-ui-core'

import type { createSheetTabInteractionController } from './sheet-tab-controller'

interface SpreadsheetSheetTabActionsProps {
  readonly sheets: Accessor<readonly SpreadsheetSheetMetadata[]>
  readonly controller: ReturnType<typeof createSheetTabInteractionController>
}

/** Renders non-tab sheet commands beside the semantic tablist. */
export function SpreadsheetSheetTabActions(props: SpreadsheetSheetTabActionsProps) {
  return (
    <div
      class="spreadsheet-sheet-tab-actions"
      role="group"
      aria-label="Sheet actions"
      style={{ display: 'flex', 'align-items': 'stretch' }}
    >
      <For each={props.sheets()}>
        {(sheet) => (
          <button
            type="button"
            class="spreadsheet-sheet-tab-reorder"
            data-testid={`sheet-tab-reorder-${sheet.id}`}
            aria-label={`Move ${sheet.name}`}
            title={props.controller.commandTitle('reorder', `Move ${sheet.name}`)}
            disabled={props.controller.commandDisabled('reorder') || props.sheets().length <= 1}
            onPointerDown={(event) => props.controller.beginReorder(sheet.id, event)}
            onPointerCancel={() => props.controller.cancelReorder(sheet.id)}
            onKeyDown={(event) => props.controller.handleReorderKeyDown(sheet.id, event)}
          >
            <span class="spreadsheet-sheet-tab-reorder-grip" aria-hidden="true">
              ⠿
            </span>
          </button>
        )}
      </For>
      <button
        type="button"
        class="spreadsheet-sheet-tab-add"
        data-testid="sheet-tab-add"
        aria-label="Add sheet"
        title={props.controller.commandTitle('add', 'Add sheet')}
        disabled={props.controller.commandDisabled('add')}
        onClick={() => props.controller.addSheet()}
      >
        +
      </button>
    </div>
  )
}
