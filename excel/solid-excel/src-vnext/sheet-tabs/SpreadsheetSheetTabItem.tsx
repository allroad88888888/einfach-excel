import { onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { SpreadsheetSheetMetadata } from '@einfach/spreadsheet-ui-core'

import type { createSheetTabInteractionController } from './sheet-tab-controller'

interface SpreadsheetSheetTabItemProps {
  readonly sheet: SpreadsheetSheetMetadata
  readonly active: Accessor<boolean>
  readonly reordering: Accessor<boolean>
  readonly reorderDropSide: Accessor<'before' | 'after' | null>
  readonly controller: ReturnType<typeof createSheetTabInteractionController>
}

/** Renders one semantic tab; the tab itself is the drag handle (Excel 口径)。 */
export function SpreadsheetSheetTabItem(props: SpreadsheetSheetTabItemProps) {
  onCleanup(() => props.controller.bindTabButton(props.sheet.id, null))

  return (
    <div
      role="presentation"
      class="spreadsheet-sheet-tab-item"
      data-sheet-id={props.sheet.id}
      data-sheet-tab-item
      data-reorder-active={props.reordering() ? 'true' : 'false'}
      data-reorder-drop={props.reorderDropSide() ?? undefined}
    >
      <button
        type="button"
        role="tab"
        class={`spreadsheet-sheet-tab${props.active() ? ' is-active' : ''}`}
        data-active={props.active() ? 'true' : 'false'}
        data-sheet-id={props.sheet.id}
        aria-selected={props.active()}
        tabindex={props.active() ? 0 : -1}
        ref={(element) => props.controller.bindTabButton(props.sheet.id, element)}
        onPointerDown={(event) => props.controller.beginTabReorder(props.sheet.id, event)}
        onClick={() => props.controller.handleTabClick(props.sheet.id)}
        onDblClick={() => props.controller.beginRename(props.sheet.id, props.sheet.name, 'pointer')}
        onContextMenu={(event) => props.controller.handleTabContextMenu(props.sheet.id, event)}
        onKeyDown={(event) => props.controller.handleTabKeyDown(props.sheet, event)}
      >
        {props.sheet.name}
      </button>
    </div>
  )
}
