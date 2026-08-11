import { createEffect, onMount } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import {
  canRedoAtom,
  canUndoAtom,
  captureFilterSortCapabilityAtom,
  captureFindReplaceCapabilityAtom,
  captureSortRangeCapabilityAtom,
  filterSortEntrypointProjectionAtom,
  findReplaceCapabilityProjectionAtom,
  formatPainterStateAtom,
  openFormatCellsAtom,
  physicalSortDiagnosticAtom,
  sortRangeSupportedAtom,
  toolbarActiveSurfaceAtom,
  toolbarCommandAvailabilityAtom,
  toolbarMutationLifecycleAtom,
  retryToolbarMutationRefreshAtom,
  activeCellLockedAtom,
  selectionLockedAtom,
  selectionSnapshotAtom,
  type CapturedFormat,
} from '@einfach/spreadsheet-ui-core'
import { openNumberFormatDialogAtom } from '../format-cells'
import {
  isVisibleProjectionResult,
  spreadsheetProjectionSnapshotAtom,
  useSpreadsheetBackend,
  useSpreadsheetUiStore,
} from '../provider'
import type { NumberFormatCustomMenuId, NumberFormatId } from './NumberFormatDropdown'
import type { RotationPreset } from './RotationDropdown'
import { cloneToolbarFormat } from './ToolbarFormatLogic'
import { useToolbarBorderCommands } from './useToolbarBorderCommands'
import { useToolbarEntrypointCommands } from './useToolbarEntrypointCommands'
import { useToolbarFormatCommands } from './useToolbarFormatCommands'
import { useToolbarMergeCommands } from './useToolbarMergeCommands'
import { useToolbarPainterCommands } from './useToolbarPainterCommands'
import { useToolbarSurfaceState } from './useToolbarSurfaceState'

/** Composes existing atoms and command controllers; it owns no product state. */
export function useToolbarRuntime() {
  const store = useSpreadsheetUiStore()
  const backend = useSpreadsheetBackend()
  const availability = useAtomValue(toolbarCommandAvailabilityAtom)
  const filterSortEntrypoint = useAtomValue(filterSortEntrypointProjectionAtom)
  const physicalSortDiagnostic = useAtomValue(physicalSortDiagnosticAtom)
  const findReplaceCapability = useAtomValue(findReplaceCapabilityProjectionAtom)
  const activeToolbarSurface = useAtomValue(toolbarActiveSurfaceAtom)
  const toolbarMutationLifecycle = useAtomValue(toolbarMutationLifecycleAtom)
  const sortSupported = useAtomValue(sortRangeSupportedAtom)
  const projectionSnapshot = useAtomValue(spreadsheetProjectionSnapshotAtom)
  const selectionSnapshot = useAtomValue(selectionSnapshotAtom)
  const activeCellLocked = useAtomValue(activeCellLockedAtom)
  const selectionLocked = useAtomValue(selectionLockedAtom)
  const formatPainterState = useAtomValue(formatPainterStateAtom)
  const canUndo = useAtomValue(canUndoAtom)
  const canRedo = useAtomValue(canRedoAtom)

  createEffect(() => {
    store.setter(captureFilterSortCapabilityAtom, backend)
    store.setter(captureFindReplaceCapabilityAtom, backend)
    store.setter(captureSortRangeCapabilityAtom, backend)
  })
  onMount(() => {
    const readyable = backend as typeof backend & { ready?: () => Promise<unknown> }
    void readyable.ready
      ?.call(backend)
      .then(() => store.setter(captureSortRangeCapabilityAtom, backend))
      .catch(() => {})
  })

  function activeCellFormat() {
    const selection = selectionSnapshot()
    const result = projectionSnapshot().result
    if (!isVisibleProjectionResult(result) || result.sheetId !== selection.selection.sheetId)
      return {}
    return cloneToolbarFormat(
      result.cells.find(
        (cell) => cell.row === selection.activeCell.row && cell.col === selection.activeCell.col,
      )?.format,
    )
  }
  function getMutationSheetId() {
    return selectionSnapshot().selection.sheetId || availability().sheetId
  }
  function isProtectionGated() {
    return activeCellLocked() || selectionLocked() !== 'open'
  }
  function activeCellHasFormat() {
    return Object.values(activeCellFormat()).some(
      (value) =>
        value !== undefined &&
        value !== null &&
        value !== false &&
        (typeof value !== 'object' || Object.keys(value).length > 0),
    )
  }
  function capturePayload(): CapturedFormat {
    const selection = selectionSnapshot()
    const result = projectionSnapshot().result
    if (!isVisibleProjectionResult(result) || result.sheetId !== selection.selection.sheetId)
      return { format: {} }
    const cell = result.cells.find(
      (candidate) =>
        candidate.row === selection.activeCell.row && candidate.col === selection.activeCell.col,
    )
    return {
      format: cloneToolbarFormat(cell?.format),
      conditionalFormat: cell?.conditionalFormat ? { ...cell.conditionalFormat } : undefined,
    }
  }

  const surface = useToolbarSurfaceState({ activeCellFormat, activeToolbarSurface, store })
  const deps = {
    activeCellFormat,
    availability,
    backend,
    closeSurface: surface.closeSurface,
    getMutationSheetId,
    projectionSnapshot,
    selectionSnapshot,
    store,
  }
  const format = useToolbarFormatCommands(deps)
  const borders = useToolbarBorderCommands(deps, format)
  const merge = useToolbarMergeCommands(deps, format)
  const entrypoints = useToolbarEntrypointCommands(deps)
  const painter = useToolbarPainterCommands(deps, formatPainterState, capturePayload)

  function handleColorPick(hex: string) {
    const mode = surface.activeColorMode()
    if (mode) {
      surface.closeSurface()
      format.dispatchCommand({ command: mode === 'fill' ? 'fill-color' : 'text-color', value: hex })
    }
  }
  function handleRotationSelect(preset: RotationPreset) {
    surface.closeSurface()
    format.dispatchCommand({
      command: 'rotation',
      value: preset === 'vertical' ? 'vertical' : String(preset),
    })
  }
  function handleHAlignSelect(value: 'left' | 'center' | 'right') {
    surface.closeSurface()
    format.dispatchCommand({ command: 'alignment', value })
  }
  function handleVAlignSelect(value: 'top' | 'center' | 'bottom') {
    surface.closeSurface()
    format.dispatchCommand({ command: 'vertical-alignment', value })
  }
  function onNumberFormatPick(id: NumberFormatId) {
    surface.closeAnchoredDropdown('number-format')
    if (id === 'WanYuan') return
    if (id === 'Custom') {
      const selection = selectionSnapshot()
      const sheetId = getMutationSheetId()
      if (sheetId)
        store.setter(openFormatCellsAtom, {
          sheetId,
          range: selection.range,
          initialFormat: activeCellFormat(),
          initialTab: 'number',
        })
    } else format.dispatchCommand({ command: 'number-format', value: id })
  }
  function openCustomNumberFormatDialog(kind: NumberFormatCustomMenuId) {
    const sheetId = getMutationSheetId()
    if (sheetId)
      store.setter(openNumberFormatDialogAtom, {
        kind,
        sheetId,
        range: selectionSnapshot().range,
        initialFormat: activeCellFormat(),
      })
  }
  function onFontFamilyPick(family: string) {
    surface.closeAnchoredDropdown('font-family')
    format.dispatchCommand({ command: 'font-family', value: family })
  }
  function onFontSizePick(size: number) {
    surface.closeAnchoredDropdown('font-size')
    format.dispatchCommand({ command: 'font-size', value: String(size) })
  }
  function retryToolbarMutationRefresh() {
    store.setter(retryToolbarMutationRefreshAtom)
  }

  return {
    activeCellFormat,
    activeCellHasFormat,
    availability,
    backend,
    borders,
    canRedo,
    canUndo,
    entrypoints,
    filterSortEntrypoint,
    findReplaceCapability,
    format,
    formatPainterState,
    handleColorPick,
    handleHAlignSelect,
    handleRotationSelect,
    handleVAlignSelect,
    isProtectionGated,
    merge,
    onFontFamilyPick,
    onFontSizePick,
    onNumberFormatPick,
    openCustomNumberFormatDialog,
    painter,
    physicalSortDiagnostic,
    retryToolbarMutationRefresh,
    selectionSnapshot,
    sortSupported,
    surface,
    toolbarMutationLifecycle,
  }
}

export type ToolbarRuntime = ReturnType<typeof useToolbarRuntime>
