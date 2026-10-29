import type { Getter } from '@einfach/core'
import type { DisplayCell, RangeProjectionResult } from '../backend/types'
import { filterSortStateAtom } from '../filter-sort'
import type { CellCoord, CellRange } from '../shared'
import type {
  AutoFillIntent,
  AutoFillOutcome,
  RunAutoFillDoubleClickInput,
} from './command-contract'
import { revisionForHistory } from './fill-acknowledgement'
import { cellKey, copyRange } from './fill-range-geometry'
import { isExactProjection } from './fill-source-projection'
import {
  ticketAuthorityIsCurrent,
  ticketFilterAllowsMutation,
  ticketIsCurrent,
  type AutoFillTicket,
  type ProjectionWitness,
} from './fill-ticket'

export function nonBlank(cell: DisplayCell | undefined): boolean {
  return cell !== undefined && (cell.formula !== undefined || cell.displayValue.length > 0)
}

export function exactGuideProjection(
  projection: RangeProjectionResult | null,
  sheetId: string,
  range: Readonly<CellRange>,
): projection is RangeProjectionResult {
  if (
    projection === null ||
    !isExactProjection(projection, sheetId, range) ||
    revisionForHistory(projection.revision) === null ||
    projection.cells.length !== 2
  ) {
    return false
  }
  const byCoord = new Map<string, DisplayCell>()
  for (const cell of projection.cells) {
    if (cell.col !== range.colStart || (cell.row !== range.rowStart && cell.row !== range.rowEnd)) {
      return false
    }
    const key = cellKey(cell.row, cell.col)
    if (byCoord.has(key)) return false
    byCoord.set(key, cell)
  }
  return (
    nonBlank(byCoord.get(cellKey(range.rowStart, range.colStart))) &&
    nonBlank(byCoord.get(cellKey(range.rowEnd, range.colStart)))
  )
}

export async function resolveDoubleClickIntent(
  get: Getter,
  ticket: AutoFillTicket,
  input: RunAutoFillDoubleClickInput,
): Promise<
  { intent: AutoFillIntent; fillRangeWitness: ProjectionWitness } | { outcome: AutoFillOutcome }
> {
  if ((get(filterSortStateAtom)[input.sheetId]?.rules.length ?? 0) > 0) {
    return { outcome: { status: 'blocked', reason: 'active-filter' } }
  }
  if (input.sourceRange.rowEnd >= input.bounds.rowCount - 1) {
    return { outcome: { status: 'no-op', reason: 'sheet-boundary' } }
  }
  if (!input.source.resolveDataEdge) {
    return {
      outcome: { status: 'blocked', reason: 'missing-data-edge-capability' },
    }
  }

  const candidates: number[] = []
  if (input.sourceRange.colStart > 0) candidates.push(input.sourceRange.colStart - 1)
  if (input.sourceRange.colEnd + 1 < input.bounds.colCount) {
    candidates.push(input.sourceRange.colEnd + 1)
  }

  let guideProjection: RangeProjectionResult | null = null
  let guideCol: number | null = null
  for (const col of candidates) {
    const guideRange = {
      rowStart: input.sourceRange.rowEnd,
      rowEnd: input.sourceRange.rowEnd + 1,
      colStart: col,
      colEnd: col,
    }
    try {
      guideProjection = await input.source.readRangeProjection(input.sheetId, guideRange)
    } catch {
      if (!ticketIsCurrent(get, ticket) || !ticketAuthorityIsCurrent(get, ticket)) {
        return { outcome: { status: 'stale' } }
      }
      if (!ticketFilterAllowsMutation(get, ticket)) {
        return { outcome: { status: 'blocked', reason: 'active-filter' } }
      }
      return { outcome: { status: 'failed', phase: 'read' } }
    }
    if (!ticketIsCurrent(get, ticket) || !ticketAuthorityIsCurrent(get, ticket)) {
      return { outcome: { status: 'stale' } }
    }
    if (!ticketFilterAllowsMutation(get, ticket)) {
      return { outcome: { status: 'blocked', reason: 'active-filter' } }
    }
    if (exactGuideProjection(guideProjection, input.sheetId, guideRange)) {
      guideCol = col
      break
    }
  }
  if (guideCol === null || guideProjection === null) {
    return { outcome: { status: 'no-op', reason: 'no-guide' } }
  }
  const guideRevision = revisionForHistory(guideProjection.revision)
  if (guideRevision === null) {
    return { outcome: { status: 'no-op', reason: 'no-guide' } }
  }
  const guideWitness: ProjectionWitness = {
    requestId: guideProjection.requestId,
    revision: guideRevision,
  }

  let edge: unknown
  try {
    edge = await input.source.resolveDataEdge({
      kind: 'resolve-data-edge',
      sheetId: input.sheetId,
      from: { row: input.sourceRange.rowEnd, col: guideCol },
      direction: 'down',
      bounds: {
        rowCount: input.bounds.rowCount,
        colCount: input.bounds.colCount,
      },
      requestId: guideWitness.requestId,
      revision: guideWitness.revision,
    })
  } catch {
    if (!ticketIsCurrent(get, ticket) || !ticketAuthorityIsCurrent(get, ticket)) {
      return { outcome: { status: 'stale' } }
    }
    if (!ticketFilterAllowsMutation(get, ticket)) {
      return { outcome: { status: 'blocked', reason: 'active-filter' } }
    }
    return { outcome: { status: 'failed', phase: 'data-edge' } }
  }
  if (!ticketIsCurrent(get, ticket) || !ticketAuthorityIsCurrent(get, ticket)) {
    return { outcome: { status: 'stale' } }
  }
  if (!ticketFilterAllowsMutation(get, ticket)) {
    return { outcome: { status: 'blocked', reason: 'active-filter' } }
  }
  if (
    typeof edge !== 'object' ||
    edge === null ||
    (edge as { sheetId?: unknown }).sheetId !== input.sheetId ||
    (edge as { requestId?: unknown }).requestId !== guideWitness.requestId ||
    (edge as { revision?: unknown }).revision !== guideWitness.revision
  ) {
    return { outcome: { status: 'failed', phase: 'data-edge' } }
  }
  const target = (edge as { target?: Partial<CellCoord> }).target
  if (
    !target ||
    !Number.isSafeInteger(target.row) ||
    !Number.isSafeInteger(target.col) ||
    target.col !== guideCol ||
    target.row! < input.sourceRange.rowEnd ||
    target.row! >= input.bounds.rowCount
  ) {
    return { outcome: { status: 'failed', phase: 'data-edge' } }
  }
  if (target.row === input.sourceRange.rowEnd) {
    return { outcome: { status: 'no-op', reason: 'guide-ended' } }
  }
  return {
    intent: {
      sheetId: input.sheetId,
      sourceRange: copyRange(input.sourceRange),
      targetRange: {
        rowStart: input.sourceRange.rowStart,
        rowEnd: target.row!,
        colStart: input.sourceRange.colStart,
        colEnd: input.sourceRange.colEnd,
      },
      direction: 'down',
    },
    fillRangeWitness: guideWitness,
  }
}
