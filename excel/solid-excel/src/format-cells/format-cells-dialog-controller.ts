import { useAtomValue } from '@einfach/solid'
import {
  captureFormatCellsBackendCapabilitiesAtom,
  closeFormatCellsAtom,
  formatCellsActiveTabAtom,
  formatCellsCanSubmitAtom,
  formatCellsDialogOpenAtom,
  formatCellsDraftAtom,
  formatCellsEditorAtom,
  formatCellsNumberCategoryAtom,
  formatCellsPreviewTextAtom,
  numberFormatForCategory,
  patchFormatCellsDraftAtom,
  runFormatCellsSaveAtom,
  setFormatCellsActiveTabAtom,
  type CellRange,
  type FormatCellsDraft,
  type FormatCellsNumberCategory,
  type FormatCellsTabId,
  type RunFormatCellsSaveInput,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { refreshVisibleProjection } from '../provider/projection-refresh'
import { useSpreadsheetBackend, useSpreadsheetUiStore } from '../provider/hooks'
import { resolveFormatSaveSourceRanges } from './format-save-source-ranges'

/** Bind the Solid view to the Core-owned Format Cells atom model. */
export function useFormatCellsDialogController() {
  const store = useSpreadsheetUiStore()
  const backend = useSpreadsheetBackend()
  const capabilities = store.setter(captureFormatCellsBackendCapabilitiesAtom, backend)
  const projectionBackend = Object.freeze({
    readVisibleProjection: capabilities.readVisibleProjection,
  }) as SpreadsheetBackend
  const savePorts: RunFormatCellsSaveInput = Object.freeze({
    resolveSourceRanges: Object.freeze((sheetId: string, range: CellRange) =>
      resolveFormatSaveSourceRanges(store, sheetId, range),
    ),
    setFormatRange: capabilities.setFormatRange,
    refreshProjection:
      capabilities.readVisibleProjection === undefined
        ? undefined
        : Object.freeze((sheetId: string) =>
            refreshVisibleProjection(store, projectionBackend, sheetId),
          ),
  })

  const editor = useAtomValue(formatCellsEditorAtom)
  const isOpen = useAtomValue(formatCellsDialogOpenAtom)
  const activeTab = useAtomValue(formatCellsActiveTabAtom)
  const draft = useAtomValue(formatCellsDraftAtom)
  const category = useAtomValue(formatCellsNumberCategoryAtom)
  const preview = useAtomValue(formatCellsPreviewTextAtom)
  const canSubmit = useAtomValue(formatCellsCanSubmitAtom)

  return {
    editor,
    isOpen,
    activeTab,
    draft,
    category,
    preview,
    canSubmit,
    close: () => store.setter(closeFormatCellsAtom),
    save: () => void store.setter(runFormatCellsSaveAtom, savePorts),
    patch: (next: Partial<FormatCellsDraft>) => store.setter(patchFormatCellsDraftAtom, next),
    setTab: (tab: FormatCellsTabId) => store.setter(setFormatCellsActiveTabAtom, tab),
    setCategory: (next: FormatCellsNumberCategory) =>
      store.setter(patchFormatCellsDraftAtom, { numberFormat: numberFormatForCategory(next) }),
  }
}
