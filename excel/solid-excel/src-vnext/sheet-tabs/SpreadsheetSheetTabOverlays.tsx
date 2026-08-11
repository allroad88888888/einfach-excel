import { createEffect, onCleanup, Show } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { SpreadsheetSheetMetadata, SheetTabsState } from '@einfach/spreadsheet-ui-core'

import { useOverlayInteraction } from '../overlay'
import type { createSheetTabInteractionController } from './sheet-tab-controller'

interface SpreadsheetSheetTabOverlaysProps {
  readonly sheetTabs: Accessor<SheetTabsState>
  readonly sheets: Accessor<readonly SpreadsheetSheetMetadata[]>
  readonly controller: ReturnType<typeof createSheetTabInteractionController>
}

/** Renders atom-owned Sheet Tabs menus while the overlay contract owns DOM focus. */
export function SpreadsheetSheetTabOverlays(props: SpreadsheetSheetTabOverlaysProps) {
  let contextRenameButton: HTMLButtonElement | null = null
  let deleteCancelButton: HTMLButtonElement | null = null
  const contextMenuOverlay = useOverlayInteraction({
    active: () => props.sheetTabs().contextMenu !== null,
    onRequestClose: () => props.controller.closeContextMenu('dismissed'),
    anchor: () => {
      const contextMenu = props.sheetTabs().contextMenu
      return contextMenu ? props.controller.tabButton(contextMenu.sheetId) : null
    },
    initialFocus: () => contextRenameButton,
    trapFocus: false,
  })
  const deleteOverlay = useOverlayInteraction({
    active: () => props.sheetTabs().deleteConfirmation !== null,
    onRequestClose: () => props.controller.cancelDelete(),
    anchor: () => {
      const confirmation = props.sheetTabs().deleteConfirmation
      return confirmation ? props.controller.tabButton(confirmation.sheetId) : null
    },
    initialFocus: () => deleteCancelButton,
  })

  createEffect(() => {
    if (!props.sheetTabs().contextMenu) return
    const onDocumentPointerDown = (event: PointerEvent) => {
      if (!contextMenuOverlay.containsTarget(event.target)) {
        props.controller.closeContextMenu('dismissed')
      }
    }
    document.addEventListener('pointerdown', onDocumentPointerDown, true)
    onCleanup(() => document.removeEventListener('pointerdown', onDocumentPointerDown, true))
  })

  return (
    <>
      <Show when={props.sheetTabs().contextMenu}>
        {(contextMenu) => (
          <div
            class="spreadsheet-sheet-tab-context-menu"
            role="menu"
            data-testid="sheet-tab-context-menu"
            ref={contextMenuOverlay.overlayRef}
            style={{ left: `${contextMenu().x}px`, top: `${contextMenu().y}px` }}
          >
            <button
              type="button"
              role="menuitem"
              data-testid="sheet-tab-menu-rename"
              title={props.controller.commandTitle('rename', 'Rename sheet')}
              disabled={props.controller.commandDisabled('rename')}
              ref={(element) => { contextRenameButton = element }}
              onClick={() => props.controller.beginContextRename()}
            >
              Rename
            </button>
            <button
              type="button"
              role="menuitem"
              data-testid="sheet-tab-menu-delete"
              title={props.controller.commandTitle('delete', 'Delete sheet')}
              disabled={props.controller.commandDisabled('delete') || props.sheets().length <= 1}
              onClick={() => props.controller.requestContextDelete()}
            >
              Delete
            </button>
          </div>
        )}
      </Show>
      <Show when={props.sheetTabs().deleteConfirmation}>
        {(confirmation) => (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sheet-tab-delete-title"
            data-testid="sheet-tab-delete-confirmation"
            ref={deleteOverlay.overlayRef}
          >
            <p id="sheet-tab-delete-title">Delete sheet “{confirmation().sheetName}”?</p>
            <button
              type="button"
              data-testid="sheet-tab-delete-cancel"
              disabled={props.sheetTabs().mutation !== null}
              ref={(element) => { deleteCancelButton = element }}
              onClick={() => props.controller.cancelDelete()}
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="sheet-tab-delete-confirm"
              disabled={props.sheetTabs().mutation !== null}
              onClick={() => props.controller.confirmDelete()}
            >
              Delete
            </button>
          </div>
        )}
      </Show>
    </>
  )
}
