import { atom } from '@einfach/core'
import type { Getter } from '@einfach/core'
import type { RangeProjectionResult } from '../backend/types'
import { selectionAuthorityWitnessAtom, selectionSnapshotAtom } from '../selection'
import { getFilterHiddenRowsForSheet, viewportFilterHiddenAtom } from '../viewport/effective-hidden'
import { workspaceActiveSheetAuthorityWitnessAtom, workspaceSessionAtom } from '../workspace'
import {
  TEXT_TO_COLUMNS_ENTRYPOINT_PENDING_ERROR,
  TEXT_TO_COLUMNS_ENTRYPOINT_SESSION_ERROR,
  TEXT_TO_COLUMNS_ENTRYPOINT_STALE_ERROR,
  TEXT_TO_COLUMNS_ENTRYPOINT_TARGET_ERROR,
} from './constants'
import { sameRange, snapshotRange, isValidCellRange } from './identity'
import {
  activeTextToColumnsEntrypointAtom,
  activeTextToColumnsMutationAtom,
  textToColumnsEntrypointStateBackingAtom,
  textToColumnsLifecycleStateAtom,
  textToColumnsOpenStateAtom,
  textToColumnsSessionIdAtom,
  textToColumnsSessionStateAtom,
  type TextToColumnsEntrypointTicket,
} from './state'
import type {
  TextToColumnsEntrypointProjection,
  TextToColumnsEntrypointState,
  TextToColumnsEntrypointTarget,
  TextToColumnsSourceRow,
} from './types'

export function resolveTextToColumnsEntrypointTarget(get: Getter): TextToColumnsEntrypointTarget | null {
  const selection = get(selectionSnapshotAtom)
  const activeCellSheetId = selection.activeCell.sheetId
  const selectionSheetId = selection.selection.sheetId
  const workspaceSheetId = get(workspaceSessionAtom).activeSheetId
  const range = selection.range
  if (
    !activeCellSheetId || !selectionSheetId || !workspaceSheetId ||
    activeCellSheetId !== selectionSheetId || selectionSheetId !== workspaceSheetId ||
    !isValidCellRange(range) || range.colStart !== range.colEnd
  ) return null
  const targetRange = snapshotRange(range)
  return Object.freeze({
    sheetId: selectionSheetId,
    range: targetRange,
    anchor: Object.freeze({ row: targetRange.rowStart, col: targetRange.colStart }),
  })
}

export function sameTextToColumnsEntrypointTarget(
  left: TextToColumnsEntrypointTarget | null,
  right: TextToColumnsEntrypointTarget | null,
): boolean {
  return left?.sheetId === right?.sheetId && left !== null && right !== null &&
    sameRange(left.range, right.range) && left.anchor.row === right.anchor.row &&
    left.anchor.col === right.anchor.col
}

export function textToColumnsEntrypointStateFor(
  status: TextToColumnsEntrypointState['status'],
  input: {
    readonly operationId?: number | null
    readonly requestId?: number | null
    readonly sessionId?: number | null
    readonly target?: TextToColumnsEntrypointTarget | null
    readonly attempt?: number
    readonly error?: string
  } = {},
): TextToColumnsEntrypointState {
  return Object.freeze({
    status, operationId: input.operationId ?? null, requestId: input.requestId ?? null,
    sessionId: input.sessionId ?? null, target: input.target ?? null,
    attempt: input.attempt ?? 0, error: input.error ?? '',
  })
}

export function textToColumnsEntrypointStateForTicket(
  status: TextToColumnsEntrypointState['status'],
  ticket: TextToColumnsEntrypointTicket,
  error = '',
  sessionId = ticket.sessionId,
): TextToColumnsEntrypointState {
  return textToColumnsEntrypointStateFor(status, {
    operationId: ticket.operationId, requestId: ticket.requestId, sessionId,
    target: ticket.target, attempt: ticket.attempt, error,
  })
}

export function nextTextToColumnsEntrypointAttempt(
  previous: TextToColumnsEntrypointState,
  target: TextToColumnsEntrypointTarget,
): number {
  if (
    (previous.status === 'blocked' || previous.status === 'error' || previous.status === 'stale') &&
    sameTextToColumnsEntrypointTarget(previous.target, target)
  ) return previous.attempt < Number.MAX_SAFE_INTEGER ? previous.attempt + 1 : previous.attempt
  return 1
}

export function textToColumnsEntrypointTicketIsOwned(
  get: Getter,
  ticket: TextToColumnsEntrypointTicket,
): boolean {
  const state = get(textToColumnsEntrypointStateBackingAtom)
  return get(activeTextToColumnsEntrypointAtom) === ticket &&
    state.operationId === ticket.operationId && state.requestId === ticket.requestId &&
    state.sessionId === ticket.sessionId &&
    sameTextToColumnsEntrypointTarget(state.target, ticket.target)
}

export function textToColumnsEntrypointAuthorityIsCurrent(
  get: Getter,
  ticket: TextToColumnsEntrypointTicket,
): boolean {
  return get(activeTextToColumnsMutationAtom) === ticket.mutation &&
    get(textToColumnsSessionIdAtom) === ticket.sessionId &&
    get(textToColumnsSessionStateAtom) === ticket.session &&
    get(textToColumnsOpenStateAtom) === ticket.open &&
    get(textToColumnsLifecycleStateAtom) === ticket.lifecycle &&
    get(selectionAuthorityWitnessAtom) === ticket.selectionWitness &&
    get(workspaceActiveSheetAuthorityWitnessAtom) === ticket.workspaceWitness &&
    sameTextToColumnsEntrypointTarget(resolveTextToColumnsEntrypointTarget(get), ticket.target)
}

export function textToColumnsSourceRowsFromResult(
  result: unknown,
  ticket: TextToColumnsEntrypointTicket,
  hiddenRows: ReadonlySet<number>,
): readonly TextToColumnsSourceRow[] | null {
  try {
    if (typeof result !== 'object' || result === null) return null
    const projection = result as Partial<RangeProjectionResult>
    const revisionIsValid = projection.revision === undefined ||
      (typeof projection.revision === 'number' && Number.isFinite(projection.revision)) ||
      (typeof projection.revision === 'string' && projection.revision.length > 0)
    if (
      projection.kind !== 'range' || projection.requestId !== ticket.requestId ||
      projection.sheetId !== ticket.target.sheetId || typeof projection.range !== 'object' ||
      projection.range === null || !sameRange(projection.range, ticket.target.range) ||
      (projection.truncated !== undefined && typeof projection.truncated !== 'boolean') ||
      projection.truncated === true || !revisionIsValid || !Array.isArray(projection.cells)
    ) return null
    const byRow = new Map<number, string>()
    for (const candidate of projection.cells) {
      if (typeof candidate !== 'object' || candidate === null) return null
      const cell = candidate as unknown as Record<string, unknown>
      const row = cell.row
      const col = cell.col
      if (
        !Number.isSafeInteger(row) || !Number.isSafeInteger(col) ||
        (row as number) < ticket.target.range.rowStart ||
        (row as number) > ticket.target.range.rowEnd ||
        col !== ticket.target.range.colStart || typeof cell.displayValue !== 'string' ||
        byRow.has(row as number)
      ) return null
      byRow.set(row as number, cell.displayValue)
    }
    const rows: TextToColumnsSourceRow[] = []
    for (let row = ticket.target.range.rowStart; row <= ticket.target.range.rowEnd; row += 1) {
      if (!hiddenRows.has(row)) rows.push(Object.freeze({ sourceRow: row, text: byRow.get(row) ?? '' }))
    }
    return Object.freeze(rows)
  } catch { return null }
}

export function filterHiddenRowsForTextToColumns(get: Getter, sheetId: string): ReadonlySet<number> {
  return new Set(getFilterHiddenRowsForSheet(get(viewportFilterHiddenAtom), sheetId))
}

export const textToColumnsEntrypointProjectionAtom = atom(
  (get): TextToColumnsEntrypointProjection => {
    const state = get(textToColumnsEntrypointStateBackingAtom)
    const liveTarget = resolveTextToColumnsEntrypointTarget(get)
    const active = get(activeTextToColumnsEntrypointAtom)
    const mutationBusy = get(activeTextToColumnsMutationAtom) !== null
    const sessionBusy = get(textToColumnsOpenStateAtom) || get(textToColumnsSessionStateAtom) !== null ||
      get(textToColumnsLifecycleStateAtom).status !== 'closed'
    const pending = active !== null
    const authorityIsCurrent = active === null || textToColumnsEntrypointAuthorityIsCurrent(get, active)
    const status = pending && !authorityIsCurrent ? 'stale' : state.status
    const error = pending && !authorityIsCurrent ? TEXT_TO_COLUMNS_ENTRYPOINT_STALE_ERROR : state.error
    const target = pending || state.status === 'stale' ? state.target : liveTarget
    const canRun = !pending && !mutationBusy && !sessionBusy && liveTarget !== null
    const canRetry = canRun && (status === 'blocked' || status === 'error' || status === 'stale')
    const disabledReason = pending
      ? authorityIsCurrent ? TEXT_TO_COLUMNS_ENTRYPOINT_PENDING_ERROR : TEXT_TO_COLUMNS_ENTRYPOINT_STALE_ERROR
      : mutationBusy ? TEXT_TO_COLUMNS_ENTRYPOINT_PENDING_ERROR
        : sessionBusy ? TEXT_TO_COLUMNS_ENTRYPOINT_SESSION_ERROR
          : liveTarget === null ? TEXT_TO_COLUMNS_ENTRYPOINT_TARGET_ERROR : null
    return Object.freeze({ ...state, status, target, error, pending, canRun, canRetry,
      disabled: disabledReason !== null, disabledReason })
  },
)
textToColumnsEntrypointProjectionAtom.debugLabel = 'spreadsheet.textToColumns.entrypoint.projection'
