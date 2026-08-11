import type { Store } from '@einfach/core'
import {
  createDeleteColumnsOperation,
  createInsertColumnsOperation,
  createInsertRowsOperation,
  dispatchMenuCommandAtom,
  isViewportHiddenContextMenuCommand,
  openPasteSpecialAtom,
  pasteSpecialCapabilityAtom,
  runFilterVisibleRowDeleteAtom,
  runStructureOperationAtom,
  runViewportHiddenContextMenuCommandAtom,
  setFreezeConfigAtom,
  type MenuCloseReason,
  type MenuCommandIntent,
  type SpreadsheetBackend,
  type ViewportHiddenContextMenuCommandKind,
} from '@einfach/spreadsheet-ui-core'

import { refreshVisibleProjection, reportCommandFailure } from '../provider'
import { createContextMenuClipboardExecutor } from './context-menu-clipboard-executor'
import { targetToRange } from './context-menu-clipboard-text'
import type { ContextMenuCommandKind } from './context-menu-types'

interface ContextMenuCommandExecutorOptions {
  readonly store: Store
  readonly backend: SpreadsheetBackend
  readonly closeMenu: (reason?: MenuCloseReason) => void
  readonly viewportHiddenCommandAvailable: (
    command: ViewportHiddenContextMenuCommandKind,
  ) => boolean
}

export interface ContextMenuCommandExecutor {
  dispatch(command: ContextMenuCommandKind): void
}

/** Dispatches manifest commands through their established Atom command paths. */
export function createContextMenuCommandExecutor(
  options: ContextMenuCommandExecutorOptions,
): ContextMenuCommandExecutor {
  const { store, backend, closeMenu, viewportHiddenCommandAvailable } = options
  const clipboard = createContextMenuClipboardExecutor({ store, backend })

  async function dispatchStructureOperation(
    intent: Parameters<typeof runStructureOperationAtom.write>[2]['intent'],
  ) {
    await store.setter(runStructureOperationAtom, {
      intent,
      source: backend,
      refreshProjection: (sheetId) =>
        refreshVisibleProjection(store, backend, sheetId, 'selection'),
    })
  }

  async function execute(intent: MenuCommandIntent): Promise<void> {
    const { command, target } = intent
    switch (command) {
      case 'clipboard.copy':
      case 'clipboard.cut':
      case 'clipboard.paste':
        await clipboard.execute(intent)
        return
      case 'cell.clear': {
        const range = targetToRange(target)
        if (range === null) return
        if (await clipboard.clearTarget(target.sheetId, range)) {
          await refreshVisibleProjection(store, backend, target.sheetId, 'selection')
        }
        return
      }
      case 'row.insert':
        if (target.kind !== 'row') return
        await dispatchStructureOperation(
          createInsertRowsOperation({
            sheetId: target.sheetId,
            rowIndex: target.rowIndex,
            count: 1,
            source: 'selection',
          }),
        )
        return
      case 'row.delete':
        if (target.kind !== 'row') return
        await store.setter(runFilterVisibleRowDeleteAtom, {
          sheetId: target.sheetId,
          rowIndex: target.rowIndex,
          count: 1,
          operationSource: 'selection',
          source: backend,
          refreshProjection: (sheetId) =>
            refreshVisibleProjection(store, backend, sheetId, 'selection'),
        })
        return
      case 'column.insert':
        if (target.kind !== 'column') return
        await dispatchStructureOperation(
          createInsertColumnsOperation({
            sheetId: target.sheetId,
            colIndex: target.colIndex,
            count: 1,
            source: 'selection',
          }),
        )
        return
      case 'column.delete':
        if (target.kind !== 'column') return
        await dispatchStructureOperation(
          createDeleteColumnsOperation({
            sheetId: target.sheetId,
            colIndex: target.colIndex,
            count: 1,
            source: 'selection',
          }),
        )
        return
      case 'row.hide':
      case 'row.unhide':
      case 'column.hide':
      case 'column.unhide':
        await store.setter(runViewportHiddenContextMenuCommandAtom, { source: backend, command })
        return
      case 'view.freezeRowsHere':
        if (target.kind === 'row') {
          store.setter(setFreezeConfigAtom, {
            source: backend,
            sheetId: target.sheetId,
            rows: target.rowIndex,
          })
        } else if (target.kind === 'cell') {
          store.setter(setFreezeConfigAtom, {
            source: backend,
            sheetId: target.sheetId,
            rows: target.cell.row,
          })
        } else if (target.kind === 'range') {
          store.setter(setFreezeConfigAtom, {
            source: backend,
            sheetId: target.sheetId,
            rows: target.range.rowStart,
          })
        }
        return
      case 'view.freezeColsHere':
        if (target.kind === 'column') {
          store.setter(setFreezeConfigAtom, {
            source: backend,
            sheetId: target.sheetId,
            cols: target.colIndex,
          })
        } else if (target.kind === 'cell') {
          store.setter(setFreezeConfigAtom, {
            source: backend,
            sheetId: target.sheetId,
            cols: target.cell.col,
          })
        } else if (target.kind === 'range') {
          store.setter(setFreezeConfigAtom, {
            source: backend,
            sheetId: target.sheetId,
            cols: target.range.colStart,
          })
        }
        return
      case 'view.freezePanes':
        if (target.kind === 'cell') {
          store.setter(setFreezeConfigAtom, {
            source: backend,
            sheetId: target.sheetId,
            rows: target.cell.row,
            cols: target.cell.col,
          })
        } else if (target.kind === 'range') {
          store.setter(setFreezeConfigAtom, {
            source: backend,
            sheetId: target.sheetId,
            rows: target.range.rowStart,
            cols: target.range.colStart,
          })
        }
        return
      case 'view.unfreeze':
        store.setter(setFreezeConfigAtom, {
          source: backend,
          sheetId: target.sheetId,
          rows: 0,
          cols: 0,
        })
        return
      default:
        return
    }
  }

  return {
    dispatch(command) {
      if (command === 'clipboard.pasteSpecial') {
        if (!store.getter(pasteSpecialCapabilityAtom)) return
        store.setter(openPasteSpecialAtom)
        closeMenu('committed')
        return
      }
      if (isViewportHiddenContextMenuCommand(command) && !viewportHiddenCommandAvailable(command))
        return
      const intent = store.setter(dispatchMenuCommandAtom, command)
      if (!intent) return
      void execute(intent)
        .catch((error: unknown) => reportCommandFailure(store, error))
        .finally(() => setTimeout(() => closeMenu('committed'), 0))
    },
  }
}
