import { runRichTextAtom } from '../rich-text/command'
import {
  suspendWorkbookDrawAtom,
  resumeWorkbookDrawAtom,
  refreshWorkbookAtom,
  controlWorkbookCalculationAtom,
} from './execution'
import {
  setWorkbookHighlightsAtom,
  isWorkbookCellVisibleAtom,
  type WorkbookHighlight,
} from './highlights'
import {
  runFormulaArgumentsAtom,
  formulaArgumentsPanelAtom,
  type FormulaArgumentsAction,
} from '../formula-arguments'
import type { RichTextRun } from '../contracts'
import type { Atom, Store } from '@einfach/core'
import { configureHostControlsAtom, readWorkbookRangesAtom, writeWorkbookCellsAtom } from './atoms'
import { exportWorkbookSnapshotAtom, openWorkbookSnapshotAtom } from './snapshot'
import { readWorkbookDisplayRangeAtom } from './display-range'
import { executeWorkbookOperationAtom } from './operations'
import { controlWorkbookViewAtom } from './view'
import { configureWorkbookHooksAtom } from './hooks'
import { findWorkbookAtom } from './queries'
import { workbookChangeAtom } from './state'
import {
  workbookDocumentAtom,
  activeWorkbookSheetAtom,
  type WorkbookDocumentSheet,
} from '../runtime/workbook-document'
import { selectionSnapshotAtom } from '../selection'
import { viewportMetricsAtom } from '../viewport/metrics'
import { editingSessionAtom, editingDraftAtom, cancelEditingAtom } from '../editing/session-atoms'
import { startCellEditingFromProjectionAtom } from '../editing/start-cell-editing'
import { commitCellEditingAtom } from '../editing/commit-cell-editing'
import { coordToA1, rangeToA1, parseA1Cell, parseA1Range } from './addresses'
import type { WorkbookOperation, WorkbookTarget } from './operation-types'
import type {
  ReadWorkbookRangesInput,
  WriteWorkbookCellsInput,
  HostControls,
  WorkbookChangeEvent,
} from './types'
import type { SelectionSnapshot } from '../selection/types'
import type { EditingSessionState } from '../editing/types'
import type { WorkbookHooks } from './hooks'
import type { RustFindRequest } from '../rust-workbook/find-commands'

type OperationInput<
  K extends WorkbookOperation['type'],
  T = WorkbookOperation,
> = T extends WorkbookOperation ? (K extends T['type'] ? Omit<T, 'type'> : never) : never
type Listener<T> = (value: T, previous: T) => void

/** A small host facade over the same Store; it owns no copy of workbook or interaction data. */
export function createWorkbookApi(store: Store) {
  const execute = (input: WorkbookOperation) => store.setter(executeWorkbookOperationAtom, input)
  const operation =
    <K extends WorkbookOperation['type']>(type: K) =>
    (input: OperationInput<K>) =>
      execute({ ...input, type } as WorkbookOperation)
  const history = (direction: 'undo' | 'redo') =>
    execute({
      type: 'history',
      direction,
      sheetId: store.getter(activeWorkbookSheetAtom)?.id ?? '',
    })
  function observe<T>(
    target: Atom<T>,
    listener: (value: T, previous: T) => void,
    equals: (a: T, b: T) => boolean = Object.is,
  ) {
    // This facade subscribes only to synchronous state atoms, never async resources.
    let previous = store.getter(target) as T
    return store.sub(target, () => {
      const value = store.getter(target) as T
      if (equals(value, previous)) return
      const before = previous
      previous = value
      listener(value, before)
    })
  }
  return Object.freeze({
    execute,
    openRichTextEditor: () => store.setter(runRichTextAtom, 'open'),
    setRichText: (sheetId: string, row: number, col: number, runs: readonly RichTextRun[]) =>
      execute({ type: 'rich-text', sheetId, row, col, runs }),
    suspendDraw: () => store.setter(suspendWorkbookDrawAtom),
    resumeDraw: () => store.setter(resumeWorkbookDrawAtom),
    refresh: () => store.setter(refreshWorkbookAtom),
    suspendCalculation: () => store.setter(controlWorkbookCalculationAtom, { action: 'suspend' }),
    resumeCalculation: () => store.setter(controlWorkbookCalculationAtom, { action: 'resume' }),
    recalculate: (sheetId?: string) =>
      store.setter(controlWorkbookCalculationAtom, { action: 'recalculate', sheetId }),
    highlight: (items: readonly WorkbookHighlight[]) =>
      store.setter(setWorkbookHighlightsAtom, items),
    clearHighlights: () => store.setter(setWorkbookHighlightsAtom, []),
    isCellVisible: (row: number, col: number, sheetId?: string, fully = false) =>
      store.setter(isWorkbookCellVisibleAtom, { row, col, sheetId, fully }),
    openFormulaDialog: (name: string) =>
      store.setter(runFormulaArgumentsAtom, { open: name.trim().toUpperCase() }),
    formulaDialog: (action: FormulaArgumentsAction) =>
      store.setter(runFormulaArgumentsAtom, action),
    getFormulaDialog: () => store.getter(formulaArgumentsPanelAtom),
    read: (input: ReadWorkbookRangesInput) => store.setter(readWorkbookRangesAtom, input),
    write: (input: WriteWorkbookCellsInput) => store.setter(writeWorkbookCellsAtom, input),
    readDisplay: (target: WorkbookTarget) => store.setter(readWorkbookDisplayRangeAtom, target),
    format: operation('format'),
    clear: operation('clear'),
    shiftCells: operation('shift'),
    resize: operation('resize'),
    visibility: operation('visibility'),
    structure: operation('structure'),
    freeze: operation('freeze'),
    merge: operation('merge'),
    sort: operation('sort'),
    filter: operation('filter'),
    conditionalFormat: operation('conditional-format'),
    validation: operation('validation'),
    addSheet: operation('sheet-add'),
    renameSheet: operation('sheet-rename'),
    deleteSheet: operation('sheet-delete'),
    copySheet: operation('sheet-copy'),
    moveSheet: operation('sheet-move'),
    hideSheet: operation('sheet-hidden'),
    colorSheet: operation('sheet-color'),
    history: operation('history'),
    undo: () => history('undo'),
    redo: () => history('redo'),
    replace: operation('replace'),
    find: (input: RustFindRequest) => store.setter(findWorkbookAtom, input),
    select: (target: WorkbookTarget, scroll = true) =>
      store.setter(controlWorkbookViewAtom, { type: 'select', ...target, scroll }),
    activateSheet: (sheetId: string) =>
      store.setter(controlWorkbookViewAtom, { type: 'activate', sheetId }),
    scrollTo: (row: number, col: number) =>
      store.setter(controlWorkbookViewAtom, { type: 'scroll', row, col }),
    zoom: (percent: number, sheetId?: string) =>
      store.setter(controlWorkbookViewAtom, { type: 'zoom', percent, sheetId }),
    getDocument: () => store.getter(workbookDocumentAtom),
    getSelection: () => store.getter(selectionSnapshotAtom),
    getViewport: () => store.getter(viewportMetricsAtom),
    getEditing: () => store.getter(editingSessionAtom),
    beginEditing: () => {
      const { activeCell } = store.getter(selectionSnapshotAtom)
      return store.setter(startCellEditingFromProjectionAtom, {
        sheetId: activeCell.sheetId,
        cell: activeCell,
      })
    },
    setDraft: (value: string) => store.setter(editingDraftAtom, { draft: value }),
    commitEditing: () => store.setter(commitCellEditingAtom, {}),
    cancelEditing: () => store.setter(cancelEditingAtom),
    configure: (controls: Partial<HostControls>) =>
      store.setter(configureHostControlsAtom, controls),
    hooks: (hooks: WorkbookHooks) => store.setter(configureWorkbookHooksAtom, hooks),
    exportSnapshot: () => store.setter(exportWorkbookSnapshotAtom),
    openSnapshot: (snapshot: string) => store.setter(openWorkbookSnapshotAtom, snapshot),
    onChange: (listener: Listener<WorkbookChangeEvent | null>) =>
      observe(workbookChangeAtom, listener),
    onSelectionChange: (listener: Listener<SelectionSnapshot>) =>
      observe(selectionSnapshotAtom, listener, (a, b) => JSON.stringify(a) === JSON.stringify(b)),
    onActiveSheetChange: (listener: Listener<WorkbookDocumentSheet | null>) =>
      observe(activeWorkbookSheetAtom, listener, (a, b) => a?.id === b?.id),
    onEditingChange: (listener: Listener<EditingSessionState>) =>
      observe(
        editingSessionAtom,
        listener,
        (a, b) =>
          a.source?.sheetId === b.source?.sheetId &&
          a.source?.cell.row === b.source?.cell.row &&
          a.source?.cell.col === b.source?.cell.col &&
          a.source?.source === b.source?.source,
      ),
    onStructureChange: (listener: Listener<WorkbookChangeEvent | null>) =>
      observe(workbookChangeAtom, (value, previous) => {
        if (
          value &&
          (/^(host\.sheet-|host\.structure$|workbook\.(changeSheets|editSheet|duplicateSheet|setSheetHidden|setSheetTabColor))/.test(
            value.kind,
          ) ||
            value.kind === 'sheet.editStructure')
        )
          listener(value, previous)
      }),
    coordToA1,
    rangeToA1,
    parseA1Cell,
    parseA1Range,
  })
}

export type WorkbookApi = ReturnType<typeof createWorkbookApi>
