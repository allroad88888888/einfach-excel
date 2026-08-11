import { onCleanup, Show } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { SpreadsheetSheetMetadata } from '@einfach/spreadsheet-ui-core'

import type { createSheetTabInteractionController } from './sheet-tab-controller'

interface SpreadsheetSheetTabItemProps {
  readonly sheet: SpreadsheetSheetMetadata
  readonly active: Accessor<boolean>
  readonly renaming: Accessor<boolean>
  readonly reordering: Accessor<boolean>
  readonly reorderDropSide: Accessor<'before' | 'after' | null>
  readonly sheetCount: number
  readonly controller: ReturnType<typeof createSheetTabInteractionController>
}

/** Renders one tab's roving-focus target plus its pointer-only reorder handle. */
export function SpreadsheetSheetTabItem(props: SpreadsheetSheetTabItemProps) {
  onCleanup(() => props.controller.bindTabButton(props.sheet.id, null))

  return (
    <div
      class="spreadsheet-sheet-tab-item"
      data-sheet-id={props.sheet.id}
      data-sheet-tab-item
      data-reorder-active={props.reordering() ? 'true' : 'false'}
      data-reorder-drop={props.reorderDropSide() ?? undefined}
    >
      <button
        type="button"
        class="spreadsheet-sheet-tab-reorder"
        data-testid={`sheet-tab-reorder-${props.sheet.id}`}
        aria-label={`Move ${props.sheet.name}`}
        title={props.controller.commandTitle('reorder', 'Move sheet')}
        disabled={props.controller.commandDisabled('reorder') || props.sheetCount <= 1}
        onPointerDown={(event) => props.controller.beginReorder(props.sheet.id, event)}
        onPointerCancel={() => props.controller.cancelReorder(props.sheet.id)}
        onKeyDown={(event) => props.controller.handleReorderKeyDown(props.sheet.id, event)}
      >
        <span class="spreadsheet-sheet-tab-reorder-grip" aria-hidden="true">
          ⠿
        </span>
      </button>
      <Show
        when={!props.renaming()}
        fallback={
          <input
            class="spreadsheet-sheet-tab-rename"
            type="text"
            data-sheet-tab-rename-input={props.sheet.id}
            value={props.sheet.name}
            disabled={props.controller.commandDisabled('rename')}
            onInput={(event) => props.controller.updateRename(props.sheet.id, event)}
            onKeyDown={(event) => props.controller.handleRenameKeyDown(props.sheet.id, event)}
            onBlur={() => props.controller.cancelRename(props.sheet.id, 'blur')}
            ref={(element) => props.controller.focusRenameInput(element)}
          />
        }
      >
        <button
          type="button"
          role="tab"
          class={`sheet-tab spreadsheet-sheet-tab${props.active() ? ' sheet-tab-active is-active' : ''}`}
          data-active={props.active() ? 'true' : 'false'}
          data-sheet-id={props.sheet.id}
          aria-selected={props.active()}
          tabindex={props.active() ? 0 : -1}
          ref={(element) => props.controller.bindTabButton(props.sheet.id, element)}
          onClick={() => props.controller.activate(props.sheet.id)}
          onDblClick={() => props.controller.beginRename(props.sheet.id, props.sheet.name, 'pointer')}
          onContextMenu={(event) => props.controller.handleTabContextMenu(props.sheet.id, event)}
          onKeyDown={(event) => props.controller.handleTabKeyDown(props.sheet, event)}
        >
          {props.sheet.name}
        </button>
      </Show>
    </div>
  )
}
