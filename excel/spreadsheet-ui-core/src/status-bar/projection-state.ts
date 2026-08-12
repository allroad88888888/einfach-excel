import { atom } from '@einfach/core'
import type { Atom, WritableAtom } from '@einfach/core'
import type { DisplayCell } from '../backend'
import type { CellRange } from '../shared'

/** Owns the display-cell snapshot the status bar aggregates over. */

const EMPTY_STATUS_BAR_PROJECTION_CELLS: readonly DisplayCell[] = Object.freeze([])

/**
 * Hard command-boundary cap for status-bar snapshots. The status bar must not
 * trust every host to have applied the projection layer's independent limit.
 */
export const STATUS_BAR_PROJECTION_CELLS_MAX = 50_000

export interface StatusBarProjectionSnapshot {
  readonly sheetId: string | null
  readonly window: Readonly<CellRange> | null
  readonly cells: readonly DisplayCell[]
  readonly upstreamTruncated: boolean
  readonly cellsTruncated: boolean
}

export interface StatusBarProjectionSyncInput {
  readonly sheetId: string | null
  readonly window: CellRange | null
  readonly cells: readonly DisplayCell[]
  readonly truncated: boolean
}

const EMPTY_STATUS_BAR_PROJECTION: StatusBarProjectionSnapshot = Object.freeze({
  sheetId: null,
  window: null,
  cells: EMPTY_STATUS_BAR_PROJECTION_CELLS,
  upstreamTruncated: false,
  cellsTruncated: false,
})

function snapshotRuntimeValue<Value>(value: Value, seen = new WeakMap<object, unknown>()): Value {
  if (value === null || typeof value !== 'object') return value
  const object = value as unknown as object
  const cached = seen.get(object)
  if (cached !== undefined) return cached as Value

  if (Array.isArray(value)) {
    const clone: unknown[] = []
    seen.set(object, clone)
    for (const item of value) clone.push(snapshotRuntimeValue(item, seen))
    return Object.freeze(clone) as Value
  }

  const clone: Record<string, unknown> = {}
  seen.set(object, clone)
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    clone[key] = snapshotRuntimeValue(item, seen)
  }
  return Object.freeze(clone) as Value
}

function snapshotStatusBarProjection(
  input: StatusBarProjectionSyncInput,
): StatusBarProjectionSnapshot {
  const exceedsLocalLimit = input.cells.length > STATUS_BAR_PROJECTION_CELLS_MAX
  return Object.freeze({
    sheetId: input.sheetId,
    window: input.window === null ? null : snapshotRuntimeValue(input.window),
    cells: snapshotRuntimeValue(input.cells.slice(0, STATUS_BAR_PROJECTION_CELLS_MAX)),
    upstreamTruncated: Boolean(input.truncated),
    cellsTruncated: exceedsLocalLimit,
  })
}

/**
 * Private aggregate projection authority. Hosts synchronize one coherent
 * cells + truncation snapshot through `syncStatusBarProjectionAtom`.
 */
const statusBarProjectionBackingAtom = atom<StatusBarProjectionSnapshot>(
  EMPTY_STATUS_BAR_PROJECTION,
)
statusBarProjectionBackingAtom.debugLabel = 'spreadsheet.statusBar.projectionBacking'

/**
 * Read-only full snapshot. Not re-exported from the module barrel — it exists
 * so `selection-aggregates.ts` can read truncation provenance without gaining
 * write access to the backing atom.
 */
export const statusBarProjectionSnapshotAtom: Atom<StatusBarProjectionSnapshot> = atom((get) =>
  get(statusBarProjectionBackingAtom),
)
statusBarProjectionSnapshotAtom.debugLabel = 'spreadsheet.statusBar.projectionSnapshot'

/** Read-only display-cell projection consumed by aggregate derivations. */
export const statusBarProjectionCellsAtom: Atom<readonly DisplayCell[]> = atom(
  (get) => get(statusBarProjectionBackingAtom).cells,
)
statusBarProjectionCellsAtom.debugLabel = 'spreadsheet.statusBar.projectionCells'

export const syncStatusBarProjectionAtom: WritableAtom<null, [StatusBarProjectionSyncInput], void> =
  atom(null, (_get, set, input: StatusBarProjectionSyncInput) => {
    set(statusBarProjectionBackingAtom, snapshotStatusBarProjection(input))
  })
syncStatusBarProjectionAtom.debugLabel = 'spreadsheet.statusBar.syncProjection'
