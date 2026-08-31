import {
  activeCellFormatAtom,
  openConditionalFormatEditorAtom,
  openFilterDropdownFromEntrypointAtom,
  openFormatCellsAtom,
  openRemoveDuplicatesFromSelectionAtom,
  openValidationRuleEditorAtom,
  reapplyFilterAtom,
  runCreateTableAtom,
  runTextToColumnsEntrypointAtom,
  runToggleTableTotalsAtSelectionAtom,
  selectionSnapshotAtom,
  type MenuItemDispatch,
} from '@einfach/spreadsheet-ui-core'
import { createHistoryEntryRecorder, refreshVisibleProjection } from '../provider'
import type { MenuBarCommandContext } from './menu-bar-command-context'

function runTextToColumnsEntrypoint(context: MenuBarCommandContext) {
  const { backend, store } = context
  void store.setter(runTextToColumnsEntrypointAtom, { source: backend })
}

function runRemoveDuplicatesEntrypoint(context: MenuBarCommandContext) {
  const { backend, store } = context
  void store.setter(openRemoveDuplicatesFromSelectionAtom, { source: backend })
}

/** Dispatches data-menu commands through existing Core entrypoints. */
export function dispatchMenuBarDataCommand(
  context: MenuBarCommandContext,
  dispatch: MenuItemDispatch,
): boolean {
  const { backend, getActiveSheetId, store } = context
  switch (dispatch.kind) {
    case 'open-conditional-format':
      store.setter(openConditionalFormatEditorAtom, null)
      return true
    case 'open-data-validation':
      store.setter(openValidationRuleEditorAtom, {})
      return true
    case 'open-text-to-columns':
      runTextToColumnsEntrypoint(context)
      return true
    case 'open-remove-duplicates':
      runRemoveDuplicatesEntrypoint(context)
      return true
    case 'create-table': {
      const snapshot = store.getter(selectionSnapshotAtom)
      const sheetId = snapshot.activeCell.sheetId || getActiveSheetId() || ''
      if (!sheetId) return true
      void store.setter(runCreateTableAtom, {
        source: backend,
        historyEntryRecorder: createHistoryEntryRecorder(backend),
        sheetId,
        range: snapshot.range,
        refreshProjection: (target: string) => refreshVisibleProjection(store, backend, target),
      })
      return true
    }
    case 'toggle-table-totals': {
      const snapshot = store.getter(selectionSnapshotAtom)
      const sheetId = snapshot.activeCell.sheetId || getActiveSheetId() || ''
      if (!sheetId) return true
      void store.setter(runToggleTableTotalsAtSelectionAtom, {
        source: backend,
        historyEntryRecorder: createHistoryEntryRecorder(backend),
        sheetId,
        cell: { row: snapshot.activeCell.row, col: snapshot.activeCell.col },
        refreshProjection: (target?: string) =>
          refreshVisibleProjection(store, backend, target ?? sheetId),
      })
      return true
    }
    case 'open-format-cells': {
      const snapshot = store.getter(selectionSnapshotAtom)
      const sheetId = snapshot.selection.sheetId || getActiveSheetId() || ''
      if (sheetId) {
        store.setter(openFormatCellsAtom, {
          sheetId,
          range: snapshot.range,
          initialFormat: store.getter(activeCellFormatAtom),
        })
      }
      return true
    }
    case 'open-filter-dropdown':
      store.setter(openFilterDropdownFromEntrypointAtom, {
        source: backend,
        entrypoint: 'menu-bar',
      })
      return true
    case 'reapply-filter':
      void store.setter(reapplyFilterAtom, {
        source: backend,
        entrypoint: 'menu-bar',
        refreshProjection: (sheetId) => refreshVisibleProjection(store, backend, sheetId),
      })
      return true
    case 'sort-asc':
      context.requestSortConfirmation('asc')
      return true
    case 'sort-desc':
      context.requestSortConfirmation('desc')
      return true
    default:
      return false
  }
}
