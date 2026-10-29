import { atom } from '@einfach/core'
import type { Atom } from '@einfach/core'
import {
  readCreateTablePort,
  readDeleteTablePort,
  readRenameTableColumnPort,
  readRenameTablePort,
  readSetTotalsRowPort,
} from './table-port-access'
import type { TablesControllerPort } from './types'

// --- capability witness -----------------------------------------------------

export const createTableCapabilityBackingAtom = atom<boolean>(false)
createTableCapabilityBackingAtom.debugLabel = 'spreadsheet.tables.createCapabilityBacking'

/** Read-only witness of the `createTable` port (captured on dispatch / capture). */
export const createTableSupportedAtom: Atom<boolean> = atom((get) =>
  get(createTableCapabilityBackingAtom),
)
createTableSupportedAtom.debugLabel = 'spreadsheet.tables.createSupported'

export const toggleTotalsCapabilityBackingAtom = atom<boolean>(false)
toggleTotalsCapabilityBackingAtom.debugLabel = 'spreadsheet.tables.totalsCapabilityBacking'

/** Read-only witness of the `setTableTotalsRow` port — gates the totals-row UI. */
export const toggleTableTotalsSupportedAtom: Atom<boolean> = atom((get) =>
  get(toggleTotalsCapabilityBackingAtom),
)
toggleTableTotalsSupportedAtom.debugLabel = 'spreadsheet.tables.totalsSupported'

export const renameTableCapabilityBackingAtom = atom<boolean>(false)
renameTableCapabilityBackingAtom.debugLabel = 'spreadsheet.tables.renameCapabilityBacking'

/** Read-only witness of the `renameTable` port — gates the rename affordance. */
export const renameTableSupportedAtom: Atom<boolean> = atom((get) =>
  get(renameTableCapabilityBackingAtom),
)
renameTableSupportedAtom.debugLabel = 'spreadsheet.tables.renameSupported'

export const renameTableColumnCapabilityBackingAtom = atom<boolean>(false)
renameTableColumnCapabilityBackingAtom.debugLabel =
  'spreadsheet.tables.renameColumnCapabilityBacking'

/** Read-only witness of the `renameTableColumn` port. */
export const renameTableColumnSupportedAtom: Atom<boolean> = atom((get) =>
  get(renameTableColumnCapabilityBackingAtom),
)
renameTableColumnSupportedAtom.debugLabel = 'spreadsheet.tables.renameColumnSupported'

export const deleteTableCapabilityBackingAtom = atom<boolean>(false)
deleteTableCapabilityBackingAtom.debugLabel = 'spreadsheet.tables.deleteCapabilityBacking'

/** Read-only witness of the `deleteTable` port — gates the delete affordance. */
export const deleteTableSupportedAtom: Atom<boolean> = atom((get) =>
  get(deleteTableCapabilityBackingAtom),
)
deleteTableSupportedAtom.debugLabel = 'spreadsheet.tables.deleteSupported'

/** Captures every table-mutation capability witness without dispatching. */
export const captureTableCapabilityAtom = atom(null, (_get, set, source: TablesControllerPort) => {
  set(createTableCapabilityBackingAtom, readCreateTablePort(source) !== undefined)
  set(toggleTotalsCapabilityBackingAtom, readSetTotalsRowPort(source) !== undefined)
  set(renameTableCapabilityBackingAtom, readRenameTablePort(source) !== undefined)
  set(renameTableColumnCapabilityBackingAtom, readRenameTableColumnPort(source) !== undefined)
  set(deleteTableCapabilityBackingAtom, readDeleteTablePort(source) !== undefined)
})
captureTableCapabilityAtom.debugLabel = 'spreadsheet.tables.captureCapability'
