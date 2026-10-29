import type { Getter, Setter } from '@einfach/core'
import type { DisplayCell, RangeProjectionResult } from '../backend/types'
import { shiftFormulaRefs } from '../clipboard'
import { resolveContentMutationAtom } from '../editing/mutation-gateway'
import { nextHistoryTransactionId } from '../history'
import { getFillHandleSourceCoord } from '../pointer'
import type { CellCoord, CellRange } from '../shared'
import {
  MAX_UI_FILL_FALLBACK_CELLS,
  type AutoFillControllerPort,
  type AutoFillIntent,
} from './command-contract'
import { classifyExactMutationAcknowledgement } from './fill-acknowledgement'
import { recordAutoFillHistory } from './fill-history'
import { affectedRangeForWrites, cellKey, copyRange, rangeCellCount } from './fill-range-geometry'
import { isExactProjection, validatedSparseSourceCells } from './fill-source-projection'
import {
  ticketAuthorityIsCurrent,
  ticketFilterAllowsMutation,
  ticketIsCurrent,
  ticketMutationContextIsCurrent,
  type AutoFillTicket,
  type MutationAttempt,
} from './fill-ticket'

export function cellInputForFill(
  cell: DisplayCell | undefined,
  source: CellCoord,
  target: CellCoord,
): string {
  if (cell?.formula) {
    return shiftFormulaRefs(cell.formula, target.row - source.row, target.col - source.col)
  }
  return cell?.displayValue ?? ''
}

export async function runFallback(
  get: Getter,
  set: Setter,
  ticket: AutoFillTicket,
  intent: AutoFillIntent,
  writeRange: Readonly<CellRange>,
  source: AutoFillControllerPort,
): Promise<MutationAttempt> {
  if (!source.importCells && rangeCellCount(writeRange) > MAX_UI_FILL_FALLBACK_CELLS) {
    return {
      kind: 'terminal',
      outcome: { status: 'unsupported', reason: 'fallback-cell-limit' },
    }
  }

  let projection: RangeProjectionResult | null
  try {
    projection = await source.readRangeProjection(intent.sheetId, intent.sourceRange)
  } catch {
    if (!ticketIsCurrent(get, ticket) || !ticketAuthorityIsCurrent(get, ticket)) {
      return { kind: 'terminal', outcome: { status: 'stale' } }
    }
    if (!ticketFilterAllowsMutation(get, ticket)) {
      return {
        kind: 'terminal',
        outcome: { status: 'blocked', reason: 'active-filter' },
      }
    }
    return { kind: 'terminal', outcome: { status: 'failed', phase: 'read' } }
  }
  if (!ticketIsCurrent(get, ticket) || !ticketAuthorityIsCurrent(get, ticket)) {
    return { kind: 'terminal', outcome: { status: 'stale' } }
  }
  if (!ticketFilterAllowsMutation(get, ticket)) {
    return {
      kind: 'terminal',
      outcome: { status: 'blocked', reason: 'active-filter' },
    }
  }
  if (projection === null || !isExactProjection(projection, intent.sheetId, intent.sourceRange)) {
    return { kind: 'terminal', outcome: { status: 'failed', phase: 'read' } }
  }

  const sourceCells = validatedSparseSourceCells(projection, intent.sourceRange)
  if (sourceCells === null) {
    return { kind: 'terminal', outcome: { status: 'failed', phase: 'read' } }
  }
  const writes: Array<{ row: number; col: number; input: string }> = []
  for (let row = writeRange.rowStart; row <= writeRange.rowEnd; row += 1) {
    for (let col = writeRange.colStart; col <= writeRange.colEnd; col += 1) {
      const resolution = set(resolveContentMutationAtom, {
        kind: 'fill-range',
        sheetId: intent.sheetId,
        cell: { row, col },
      })
      if (resolution.status === 'blocked' || resolution.cell === undefined) {
        return {
          kind: 'terminal',
          outcome: {
            status: 'blocked',
            reason: resolution.status === 'blocked' ? resolution.reason : 'invalid-target',
          },
        }
      }
      const sourceCoord = getFillHandleSourceCoord(intent.sourceRange, { row, col })
      writes.push({
        row: resolution.cell.row,
        col: resolution.cell.col,
        input: cellInputForFill(
          sourceCells.get(cellKey(sourceCoord.row, sourceCoord.col)),
          sourceCoord,
          { row, col },
        ),
      })
    }
  }
  const affectedRange = affectedRangeForWrites(writes)
  if (affectedRange === null) {
    return { kind: 'terminal', outcome: { status: 'no-op', reason: 'no-write-range' } }
  }

  if (source.importCells) {
    if (!ticketFilterAllowsMutation(get, ticket)) {
      return {
        kind: 'terminal',
        outcome: { status: 'blocked', reason: 'active-filter' },
      }
    }
    let result: unknown
    try {
      result = await source.importCells({
        kind: 'import-cells',
        sheetId: intent.sheetId,
        cells: writes,
        range: affectedRange,
      })
    } catch {
      const committedStale = !ticketMutationContextIsCurrent(get, ticket)
      return {
        kind: 'terminal',
        outcome: {
          status: 'outcome-unknown',
          path: 'import-cells',
          reason: committedStale ? 'committed-stale' : 'transport-rejected',
        },
      }
    }
    const authorityCurrent = ticketMutationContextIsCurrent(get, ticket)
    const acknowledgement = classifyExactMutationAcknowledgement(
      result,
      intent.sheetId,
      affectedRange,
    )
    if (acknowledgement.kind === 'invalid') {
      return {
        kind: 'terminal',
        outcome: {
          status: 'outcome-unknown',
          path: 'import-cells',
          reason: 'invalid-acknowledgement',
        },
      }
    }
    const historyResult = recordAutoFillHistory(set, ticket, {
      transactionId: nextHistoryTransactionId(),
      kind: 'range.fill',
      sheetId: intent.sheetId,
      projectionRevision: acknowledgement.revision,
      affectedRange: copyRange(acknowledgement.affectedRange),
    })
    if (historyResult === 'rejected') {
      return {
        kind: 'terminal',
        outcome: {
          status: 'outcome-unknown',
          path: 'import-cells',
          reason: 'history-rejected',
        },
      }
    }
    return {
      kind: 'success',
      value: {
        path: 'import-cells',
        affectedRange: copyRange(acknowledgement.affectedRange),
        historyEntries: historyResult === 'recorded' ? 1 : 0,
        committedStale: !authorityCurrent,
      },
    }
  }

  let committedWriteCount = 0
  let historyEntries = 0
  for (const write of writes) {
    const authorityCurrentBeforeWrite =
      ticketIsCurrent(get, ticket) && ticketAuthorityIsCurrent(get, ticket)
    const filterAllowsWrite = ticketFilterAllowsMutation(get, ticket)
    if (!authorityCurrentBeforeWrite || !filterAllowsWrite) {
      if (committedWriteCount > 0) {
        const committedRange = affectedRangeForWrites(writes.slice(0, committedWriteCount))
        return {
          kind: 'success',
          value: {
            path: 'set-cell-input',
            affectedRange: copyRange(committedRange!),
            historyEntries,
            committedStale: true,
          },
        }
      }
      return {
        kind: 'terminal',
        outcome: !authorityCurrentBeforeWrite
          ? { status: 'stale' }
          : {
              status: 'blocked',
              reason: 'active-filter',
            },
      }
    }
    let result: unknown
    try {
      result = await source.setCellInput({
        kind: 'set-cell-input',
        sheetId: intent.sheetId,
        row: write.row,
        col: write.col,
        input: write.input,
      })
    } catch {
      const committedStale = !ticketMutationContextIsCurrent(get, ticket)
      return {
        kind: 'terminal',
        outcome: {
          status: 'outcome-unknown',
          path: 'set-cell-input',
          reason: committedStale ? 'committed-stale' : 'transport-rejected',
        },
      }
    }
    const authorityCurrent = ticketMutationContextIsCurrent(get, ticket)
    const expectedAffectedRange = {
      rowStart: write.row,
      rowEnd: write.row,
      colStart: write.col,
      colEnd: write.col,
    }
    const acknowledgement = classifyExactMutationAcknowledgement(
      result,
      intent.sheetId,
      expectedAffectedRange,
    )
    if (acknowledgement.kind === 'invalid') {
      return {
        kind: 'terminal',
        outcome: {
          status: 'outcome-unknown',
          path: 'set-cell-input',
          reason: 'invalid-acknowledgement',
        },
      }
    }
    const historyResult = recordAutoFillHistory(set, ticket, {
      transactionId: nextHistoryTransactionId(),
      kind: 'cell.set-input',
      sheetId: intent.sheetId,
      projectionRevision: acknowledgement.revision,
      affectedRange: copyRange(acknowledgement.affectedRange),
    })
    if (historyResult === 'rejected') {
      return {
        kind: 'terminal',
        outcome: {
          status: 'outcome-unknown',
          path: 'set-cell-input',
          reason: 'history-rejected',
        },
      }
    }
    committedWriteCount += 1
    if (historyResult === 'recorded') historyEntries += 1
    if (!authorityCurrent) {
      const committedRange = affectedRangeForWrites(writes.slice(0, committedWriteCount))
      return {
        kind: 'success',
        value: {
          path: 'set-cell-input',
          affectedRange: copyRange(committedRange!),
          historyEntries,
          committedStale: true,
        },
      }
    }
  }
  return {
    kind: 'success',
    value: {
      path: 'set-cell-input',
      affectedRange: copyRange(affectedRange),
      historyEntries,
    },
  }
}
