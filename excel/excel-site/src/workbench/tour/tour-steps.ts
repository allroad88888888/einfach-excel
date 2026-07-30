/**
 * Workbench tour choreography — four steps, each a `run(store)` that drives
 * the exact public `@einfach/spreadsheet-ui-core` atoms the real chrome
 * already reads reactively (selection, editing, sheet activation). No DOM
 * events, no synthetic keyboard dispatch (unlike the old `excel/showcase`
 * F2 hack this replaces): every write here lands on an atom the grid,
 * formula bar, status bar, and sheet tabs already subscribe to, so their UI
 * catches up on its own — including across the async sheet-tab / projection
 * loads the worker-wasm backend requires.
 *
 * Every coordinate below comes from `WB` (`../workbench-seed.ts`) — nothing
 * here hardcodes a row/col/address.
 *
 * IMPORTANT: `WB.*.sheetId` is a display NAME ("Overview"/"Forecast"/
 * "Assumptions"), not the runtime sheet id — the worker-wasm backend does
 * not honor the seed's requested ids; at runtime the live list is
 * `[{id:'sheet-1', name:'Overview'}, ...]`. Every atom below wants the real
 * id, so `activateSheet` resolves NAME -> id via `sheetTabsSheetsAtom` and
 * hands the resolved id to its callback; nothing else may read `WB.*.sheetId`
 * straight into an atom call.
 */
import type { Store } from '@einfach/core'
import type { CellCoord } from '@einfach/spreadsheet-ui-core'
import {
  activateSheetTabAtom,
  parseA1Cell,
  scrollToCellAtom,
  selectCellAtom,
  setSelectionAtom,
  sheetTabsSheetsAtom,
  startEditingAtom,
} from '@einfach/spreadsheet-ui-core'
import { WB } from '../workbench-seed'

export type TourStepId = 'formula' | 'aggregate' | 'edit' | 'forecast'

export interface TourStep {
  readonly id: TourStepId
  run(store: Store): void
}

function mustA1(a1: string): CellCoord {
  const coord = parseA1Cell(a1)
  if (!coord) throw new Error(`workbench tour: invalid A1 reference "${a1}"`)
  return coord
}

function findSheetIdByName(store: Store, sheetName: string): string | null {
  const sheet = store.getter(sheetTabsSheetsAtom).find((candidate) => candidate.name === sheetName)
  return sheet ? sheet.id : null
}

/**
 * Resolves `sheetName` (a `WB.*.sheetId` display name) to the live sheet's
 * runtime id, then activates it via `activateSheetTabAtom` — the same
 * command `SpreadsheetSheetTabs` clicks dispatch — before handing that
 * resolved id to `onActive`. `SpreadsheetChrome` always seeds
 * `SpreadsheetSheetTabs` with an empty array and supersedes it from
 * `backend.listSheets()` a tick later, so the very first tour interaction
 * can race that load. Retry once the list atom contains a sheet with this
 * name, instead of assuming the seed already landed; this also covers a
 * visitor skipping straight to a later step.
 */
function activateSheet(store: Store, sheetName: string, onActive: (sheetId: string) => void): void {
  const sheetId = findSheetIdByName(store, sheetName)
  if (sheetId !== null && store.setter(activateSheetTabAtom, { sheetId })) {
    onActive(sheetId)
    return
  }
  const unsubscribe = store.sub(sheetTabsSheetsAtom, () => {
    const resolvedId = findSheetIdByName(store, sheetName)
    if (resolvedId === null || !store.setter(activateSheetTabAtom, { sheetId: resolvedId })) return
    unsubscribe()
    onActive(resolvedId)
  })
}

function selectAndScroll(store: Store, sheetId: string, coord: CellCoord): void {
  store.setter(selectCellAtom, { sheetId, coord })
  store.setter(scrollToCellAtom, { coord })
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'formula',
    run(store) {
      const { sheetId: sheetName, row, col } = WB.sumFormulaCell
      activateSheet(store, sheetName, (sheetId) => selectAndScroll(store, sheetId, { row, col }))
    },
  },
  {
    id: 'aggregate',
    run(store) {
      const { sheetId: sheetName, start, end } = WB.aggregateRange
      const anchor = mustA1(start)
      const focus = mustA1(end)
      activateSheet(store, sheetName, (sheetId) => {
        store.setter(setSelectionAtom, { kind: 'range', sheetId, anchor, focus })
        store.setter(scrollToCellAtom, { coord: anchor })
      })
    },
  },
  {
    id: 'edit',
    run(store) {
      const { sheetId: sheetName, row, col } = WB.editCell
      activateSheet(store, sheetName, (sheetId) => {
        selectAndScroll(store, sheetId, { row, col })
        // Empty draft — same "type to overwrite" path a printable keypress
        // takes on a selected cell — so this works identically regardless of
        // which step ran before it (no dependency on a live projection read
        // of the cell's current formatted value).
        store.setter(startEditingAtom, {
          sheetId,
          cell: { row, col },
          draft: '',
          source: 'keyboard',
        })
      })
    },
  },
  {
    id: 'forecast',
    run(store) {
      const { sheetId: sheetName, row, col } = WB.crossSheetCell
      activateSheet(store, sheetName, (sheetId) => selectAndScroll(store, sheetId, { row, col }))
    },
  },
]

export function findTourStepIndex(id: TourStepId): number {
  return TOUR_STEPS.findIndex((step) => step.id === id)
}
