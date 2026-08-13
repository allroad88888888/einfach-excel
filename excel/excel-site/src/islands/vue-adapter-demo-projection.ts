import { createStore } from '@einfach/core'
import {
  setSelectionBoundsAtom,
  type DisplayCell,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'

export const vueDemoSheetId = 'vue-demo-sheet'
export const vueDemoRange = { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 3 }
export const vueDemoCells: readonly DisplayCell[] = Array.from({ length: 16 }, (_, index) => ({
  row: Math.floor(index / 4),
  col: index % 4,
  displayValue: `${String.fromCharCode(65 + (index % 4))}${Math.floor(index / 4) + 1}`,
}))

const unsupportedBackendOperation = (): never => {
  throw new Error('The Vue demo does not fetch or mutate a backend.')
}

/** Supplies a fixed projection while rejecting hidden backend work. */
export const vueDemoBackend: SpreadsheetBackend = Object.freeze({
  readVisibleProjection: unsupportedBackendOperation,
  readRangeProjection: unsupportedBackendOperation,
  setCellInput: unsupportedBackendOperation,
})

/** Holds this module's one deterministic selection state. */
export const vueDemoStore = createStore()
vueDemoStore.setter(setSelectionBoundsAtom, { rowCount: 4, colCount: 4 })
