import { atom } from '@einfach/core'

// --- request-id sequence + single-lane guard -------------------------------

export const tableRequestIdBackingAtom = atom<number>(0)
tableRequestIdBackingAtom.debugLabel = 'spreadsheet.tables.requestIdBacking'

export const activeCreateTableAtom = atom<boolean>(false)
activeCreateTableAtom.debugLabel = 'spreadsheet.tables.activeCreate'

export const activeToggleTotalsAtom = atom<boolean>(false)
activeToggleTotalsAtom.debugLabel = 'spreadsheet.tables.activeToggleTotals'

export const activeRenameTableAtom = atom<boolean>(false)
activeRenameTableAtom.debugLabel = 'spreadsheet.tables.activeRename'

export const activeDeleteTableAtom = atom<boolean>(false)
activeDeleteTableAtom.debugLabel = 'spreadsheet.tables.activeDelete'
