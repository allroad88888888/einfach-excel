import type { Store } from '@einfach/core'
import type { Accessor } from 'solid-js'
import {
  activateSheetTabAtom,
  addSheetTabAtom,
  beginSheetTabRenameAtom,
  cancelSheetTabDeleteAtom,
  commitSheetTabRenameAtom,
  commitSheetTabReorderAtom,
  confirmSheetTabDeleteAtom,
  createBeginSheetTabReorderIntent,
  createCancelSheetTabRenameIntent,
  createCancelSheetTabReorderIntent,
  createCloseSheetTabContextMenuIntent,
  createOpenSheetTabContextMenuIntent,
  createUpdateSheetTabRenameIntent,
  createUpdateSheetTabReorderIntent,
  dispatchSheetTabIntentAtom,
  disposeSheetTabsAtom,
  initializeSheetTabsAtom,
  requestSheetTabDeleteAtom,
  sheetTabsAtom,
  type SheetTabInteractionSource,
  type SheetTabMutationKind,
  type SheetTabsState,
  type SpreadsheetBackend,
  type SpreadsheetSheetMetadata,
} from '@einfach/spreadsheet-ui-core'

import { createSheetTabFocusRegistry, resolveSheetTabKeyboardTarget } from './sheet-tab-focus'

interface SheetTabSeed {
  readonly id: string
  readonly name: string
  readonly index?: number
}

interface SheetTabInteractionControllerOptions {
  readonly store: Store
  readonly sheetTabs: Accessor<SheetTabsState>
  readonly sheets: Accessor<readonly SpreadsheetSheetMetadata[]>
}

type CloseContextMenuReason = 'dismissed' | 'sheet-changed' | 'committed' | 'cancelled'
type RenameCancelReason = 'escape' | 'blur'

/** Translates Sheet Tabs DOM events into the feature's existing command atoms. */
export function createSheetTabInteractionController(options: SheetTabInteractionControllerOptions) {
  const { store, sheetTabs, sheets } = options
  const focus = createSheetTabFocusRegistry()
  let reorderListeners: (() => void) | null = null
  let reorderCapture: { element: HTMLElement; pointerId: number } | null = null

  function commandDisabled(kind: SheetTabMutationKind): boolean {
    const state = sheetTabs()
    return state.phase !== 'ready' || state.mutation !== null || !state.capabilities[kind]
  }
  function commandTitle(kind: SheetTabMutationKind, label: string): string {
    const state = sheetTabs()
    if (state.phase === 'loading') return 'Loading the live sheet list'
    if (state.mutation !== null) return 'Another sheet change is in progress'
    if (!state.capabilities.list) return `${label} is unavailable without a live sheet list`
    if (!state.capabilities[kind]) return `${label} is unavailable in this workbook backend`
    return label
  }

  function closeContextMenu(reason: CloseContextMenuReason): void {
    store.setter(dispatchSheetTabIntentAtom, createCloseSheetTabContextMenuIntent(reason))
  }

  function activate(sheetId: string): void {
    if (sheetTabs().contextMenu) closeContextMenu('sheet-changed')
    store.setter(activateSheetTabAtom, { sheetId })
  }

  function beginRename(
    sheetId: string, draftName: string, source: SheetTabInteractionSource,
  ): void {
    if (commandDisabled('rename')) return
    store.setter(beginSheetTabRenameAtom, { sheetId, draftName, source })
  }
  function cancelRename(sheetId: string, reason: RenameCancelReason = 'escape'): void {
    store.setter(dispatchSheetTabIntentAtom, createCancelSheetTabRenameIntent(sheetId, reason))
    if (reason === 'escape') queueMicrotask(() => focus.focus(sheetId))
  }

  function commitRename(sheetId: string): void {
    void Promise.resolve(store.setter(commitSheetTabRenameAtom, { sheetId })).then(
      () => {
        if (store.getter(sheetTabsAtom).rename === null) focus.focus(sheetId)
      },
      () => undefined,
    )
  }

  function updateRename(sheetId: string, event: InputEvent): void {
    const draftName = (event.currentTarget as HTMLInputElement).value
    const intent = createUpdateSheetTabRenameIntent(sheetId, draftName)
    if (intent) store.setter(dispatchSheetTabIntentAtom, intent)
  }
  function focusRenameInput(element: HTMLInputElement): void {
    queueMicrotask(() => {
      if (!element.isConnected) return
      element.focus()
      element.select()
    })
  }

  function handleRenameKeyDown(sheetId: string, event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitRename(sheetId)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelRename(sheetId)
    }
  }

  function openContextMenu(
    sheetId: string, x: number, y: number, source: SheetTabInteractionSource,
  ): void {
    store.setter(
      dispatchSheetTabIntentAtom,
      createOpenSheetTabContextMenuIntent({ sheetId, x, y, source }),
    )
  }

  function handleTabContextMenu(sheetId: string, event: MouseEvent): void {
    event.preventDefault()
    openContextMenu(sheetId, event.clientX, event.clientY, 'context-menu')
  }

  function handleTabKeyDown(sheet: SpreadsheetSheetMetadata, event: KeyboardEvent): void {
    if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
      event.preventDefault()
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
      openContextMenu(sheet.id, rect.left, rect.bottom, 'keyboard')
      return
    }
    if (event.key === 'F2' && !event.altKey && !event.isComposing) {
      event.preventDefault()
      beginRename(sheet.id, sheet.name, 'keyboard')
      return
    }

    const targetSheetId = resolveSheetTabKeyboardTarget(event, sheets(), sheet.id)
    if (!targetSheetId) return
    event.preventDefault()
    activate(targetSheetId)
    focus.focus(targetSheetId)
  }

  function beginContextRename(): void {
    const contextMenu = sheetTabs().contextMenu
    if (!contextMenu) return
    const sheet = sheets().find((candidate) => candidate.id === contextMenu.sheetId)
    closeContextMenu('committed')
    if (sheet) beginRename(sheet.id, sheet.name, 'context-menu')
  }

  function requestContextDelete(): void {
    const contextMenu = sheetTabs().contextMenu
    if (contextMenu) store.setter(requestSheetTabDeleteAtom, { sheetId: contextMenu.sheetId })
  }

  function releaseReorderCapture(): void {
    const capture = reorderCapture
    reorderCapture = null
    if (!capture) return
    try {
      capture.element.releasePointerCapture?.(capture.pointerId)
    } catch {
      // Pointer capture can already be released by the browser after pointerup.
    }
  }

  function clearReorderListeners(): void {
    const cleanup = reorderListeners
    reorderListeners = null
    cleanup?.()
    releaseReorderCapture()
  }

  function tabDropPlacement(event: PointerEvent, sheetId: string) {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-sheet-tab-item]')
    const targetSheetId = target?.dataset.sheetId
    if (!target || !targetSheetId || targetSheetId === sheetId) return null

    const rect = target.getBoundingClientRect()
    const targetIndex = sheets().findIndex((sheet) => sheet.id === targetSheetId)
    const before = event.clientX < rect.left + rect.width / 2
    return {
      beforeSheetId: before ? targetSheetId : null,
      afterSheetId: before ? null : targetSheetId,
      targetIndex: targetIndex < 0 ? null : before ? targetIndex : targetIndex + 1,
    }
  }

  function updateReorder(sheetId: string, event: PointerEvent): void {
    if (store.getter(sheetTabsAtom).reorder?.sheetId !== sheetId) return
    const placement = tabDropPlacement(event, sheetId)
    if (!placement) return
    const intent = createUpdateSheetTabReorderIntent({ sheetId, ...placement })
    store.setter(dispatchSheetTabIntentAtom, intent)
  }

  function commitReorder(sheetId: string, event: PointerEvent): void {
    if (store.getter(sheetTabsAtom).reorder?.sheetId !== sheetId) return
    event.preventDefault()
    event.stopPropagation()
    void store.setter(commitSheetTabReorderAtom, { sheetId })
  }

  function cancelReorder(sheetId: string, reason: 'escape' | 'blur' = 'blur'): void {
    clearReorderListeners()
    if (store.getter(sheetTabsAtom).reorder?.sheetId === sheetId) {
      store.setter(dispatchSheetTabIntentAtom, createCancelSheetTabReorderIntent(sheetId, reason))
    }
  }

  function beginReorder(sheetId: string, event: PointerEvent): void {
    if (commandDisabled('reorder') || sheets().length <= 1) return
    event.preventDefault()
    event.stopPropagation()
    clearReorderListeners()
    closeContextMenu('sheet-changed')
    const handle = event.currentTarget as HTMLElement
    try {
      handle.setPointerCapture?.(event.pointerId)
      reorderCapture = { element: handle, pointerId: event.pointerId }
    } catch {
      // Synthetic pointer events can omit an active capture session.
    }
    store.setter(dispatchSheetTabIntentAtom, createBeginSheetTabReorderIntent({ sheetId, source: 'pointer' }))

    const onPointerMove = (moveEvent: PointerEvent) => updateReorder(sheetId, moveEvent)
    const onPointerUp = (upEvent: PointerEvent) => {
      clearReorderListeners()
      commitReorder(sheetId, upEvent)
    }
    const onPointerCancel = () => cancelReorder(sheetId)
    const cleanup = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
    }
    reorderListeners = cleanup
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
  }

  return {
    initialize(backend: SpreadsheetBackend, seedSheets: readonly SheetTabSeed[]): void {
      void store.setter(initializeSheetTabsAtom, {
        backend,
        sheets: seedSheets.map((sheet, index) => ({ ...sheet, index: sheet.index ?? index })),
      })
    },
    dispose(): void {
      clearReorderListeners()
      focus.clear()
      store.setter(disposeSheetTabsAtom)
    },
    commandDisabled,
    commandTitle,
    activate,
    addSheet: () => void store.setter(addSheetTabAtom),
    beginRename,
    cancelRename,
    commitRename,
    updateRename,
    focusRenameInput,
    handleRenameKeyDown,
    handleTabContextMenu,
    handleTabKeyDown,
    beginContextRename,
    requestContextDelete,
    closeContextMenu,
    cancelDelete: () => store.setter(cancelSheetTabDeleteAtom),
    confirmDelete: () => void store.setter(confirmSheetTabDeleteAtom),
    beginReorder,
    cancelReorder,
    handleReorderKeyDown(sheetId: string, event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        cancelReorder(sheetId, 'escape')
      }
    },
    reorderDropSide(sheetId: string): 'before' | 'after' | null {
      const reorder = sheetTabs().reorder
      if (!reorder) return null
      if (reorder.beforeSheetId === sheetId) return 'before'
      if (reorder.afterSheetId === sheetId) return 'after'
      return null
    },
    bindTabButton: focus.bind,
    tabButton: focus.element,
  }
}
