import type { Getter, Setter } from '@einfach/core'
import { clipboardErrorMessage } from '../clipboard/error-messages'
import type { VisibleProjectionResult } from '../contracts'
import {
  applyVisibleProjectionAtom,
  createVisibleProjectionRequest,
  issueProjectionRequestIdAtom,
  projectionSnapshotAtom,
  validateProjectionResult,
} from '../projection'
import { sheetProtectionAtom } from '../protection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { workbookDocumentAtom } from '../runtime/workbook-document'
import type { RustWorkbookConnection } from '../rust-workbook'
import type {
  RustTextColumnsPreview,
  RustTextColumnsRequest,
} from '../rust-workbook/text-columns-commands'
import { selectionBoundsAtom, setSelectionAtom } from '../selection'
import type { CellRange } from '../shared'
import { scrollToCellAtom } from '../viewport/metrics'
import { planFileTextColumns, type FileTextColumnsPlan } from './file-parse'

const MAX_READ_CHUNK_CELLS = 50_000

function rangesIntersect(a: CellRange, b: CellRange): boolean {
  return (
    a.rowStart <= b.rowEnd &&
    a.rowEnd >= b.rowStart &&
    a.colStart <= b.colEnd &&
    a.colEnd >= b.colStart
  )
}

export function sheetDimensionsFor(
  get: Getter,
  sheetId: string,
): { readonly rowCount: number; readonly colCount: number } {
  const sheet = get(workbookDocumentAtom).sheets.find((entry) => entry.id === sheetId)
  const bounds = get(selectionBoundsAtom)
  return {
    rowCount: sheet?.rowCount ?? bounds.rowCount,
    colCount: sheet?.colCount ?? bounds.colCount,
  }
}

export async function previewFileTextColumns(
  get: Getter,
  set: Setter,
  connection: RustWorkbookConnection,
  lines: readonly string[],
  request: RustTextColumnsRequest,
): Promise<
  (RustTextColumnsPreview & { readonly revision: number; readonly tsv: string }) | string
> {
  const { rowCount, colCount } = sheetDimensionsFor(get, request.sheetId)
  const plan = planFileTextColumns({
    lines,
    destination: request.destination,
    rowCount,
    colCount,
    mode: request.mode,
    columnTypes: request.columnTypes,
    numberOptions: request.numberOptions,
  })
  if (typeof plan === 'string') return plan

  const cols = plan.target.colEnd - plan.target.colStart + 1
  const rowsPerChunk = Math.max(1, Math.floor(MAX_READ_CHUNK_CELLS / Math.max(1, cols)))
  let overwrittenCells = 0
  let revision: number | undefined
  for (let start = plan.target.rowStart; start <= plan.target.rowEnd; start += rowsPerChunk) {
    const chunk: CellRange = {
      rowStart: start,
      colStart: plan.target.colStart,
      rowEnd: Math.min(plan.target.rowEnd, start + rowsPerChunk - 1),
      colEnd: plan.target.colEnd,
    }
    const requestId = set(issueProjectionRequestIdAtom)
    if (requestId === null) return 'Could not allocate a projection request.'
    const projReq = createVisibleProjectionRequest({
      sheetId: request.sheetId,
      requestId,
      window: chunk,
      reason: 'toolbar',
    })
    const snapshot: VisibleProjectionResult = await connection.request('projection.readVisible', {
      request: projReq,
    })
    if (revision === undefined) {
      revision =
        typeof snapshot.revision === 'number' ? snapshot.revision : Number(snapshot.revision ?? 0)
    }
    if (snapshot.mergedRanges?.some((merged) => rangesIntersect(merged, plan.target)))
      return 'Unmerge the source and destination before splitting text.'
    for (const cell of snapshot.cells) {
      if (
        cell.row >= chunk.rowStart &&
        cell.row <= chunk.rowEnd &&
        cell.col >= chunk.colStart &&
        cell.col <= chunk.colEnd &&
        (Boolean(cell.formula) ||
          (cell.valueKind !== undefined ? cell.valueKind !== 'blank' : cell.displayValue !== ''))
      ) {
        overwrittenCells += 1
      }
    }
  }
  return {
    sourceColumnCount: plan.sourceColumnCount,
    target: plan.target,
    overwrittenCells,
    sample: plan.sample,
    sampleTruncated: plan.sampleTruncated,
    revision: revision ?? 0,
    tsv: plan.tsv,
  }
}

export async function applyFileTextColumns(input: {
  readonly get: Getter
  readonly set: Setter
  readonly connection: RustWorkbookConnection
  readonly sheetId: string
  readonly target: CellRange
  readonly tsv: string
  readonly expectedRevision: number
}): Promise<
  { readonly ok: true; readonly target: CellRange } | { readonly ok: false; readonly error: string }
> {
  const { get, set, connection, sheetId, target, tsv, expectedRevision } = input
  const witness = get(projectionSnapshotAtom)
  const visible = witness.request
  if (
    witness.status !== 'ready' ||
    visible?.kind !== 'visible-window' ||
    visible.sheetId !== sheetId
  )
    return { ok: false, error: 'Wait for the worksheet to finish loading.' }
  if (
    witness.result?.kind === 'visible-window' &&
    witness.result.revision !== undefined &&
    witness.result.revision !== expectedRevision
  )
    return { ok: false, error: 'The workbook changed. Preview again before splitting text.' }

  const { rowCount, colCount } = sheetDimensionsFor(get, sheetId)
  const protection = get(sheetProtectionAtom)[sheetId]
  const requestId = set(issueProjectionRequestIdAtom)
  if (requestId === null) return { ok: false, error: 'Could not allocate a projection request.' }
  const projection = createVisibleProjectionRequest({
    sheetId: visible.sheetId,
    window: visible.window,
    viewport: visible.viewport,
    requestId,
    reason: 'toolbar',
  })
  try {
    const result = await connection.request('clipboard.paste', {
      request: {
        sheetId,
        requestId,
        row: target.rowStart,
        col: target.colStart,
        selection: {
          rowStart: target.rowStart,
          colStart: target.colStart,
          rowEnd: target.rowStart,
          colEnd: target.colStart,
        },
        text: tsv,
        mode: 'values',
        rowCount,
        colCount,
        unlockedRanges: protection?.mode === 'protected' ? protection.unlockedRanges : undefined,
      },
      projection,
    })
    if (get(rustWorkbookConnectionAtom) !== connection)
      return { ok: false, error: 'WORKBOOK_CONNECTION_REPLACED' }
    const ack = result.acknowledgement
    if (
      ack.sheetId !== sheetId ||
      ack.requestId !== requestId ||
      ack.revision !== result.projection.revision ||
      !validateProjectionResult(result.projection, { request: projection }).ok
    )
      return {
        ok: false,
        error: 'The split was applied, but the view could not be updated. Check the sheet before retrying.',
      }
    const applied = set(applyVisibleProjectionAtom, {
      witness,
      request: projection,
      result: result.projection,
    })
    if (applied.status === 'rejected') {
      return {
        ok: false,
        error: 'The split was applied, but the view could not be updated. Check the sheet before retrying.',
      }
    }
    const range = ack.affectedRange ?? target
    set(setSelectionAtom, {
      kind: 'range',
      sheetId,
      anchor: { row: range.rowStart, col: range.colStart },
      focus: { row: range.rowEnd, col: range.colEnd },
    })
    set(scrollToCellAtom, { coord: { row: range.rowStart, col: range.colStart } })
    return { ok: true, target: range }
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error)
    if (raw.includes('CLIPBOARD_SPILL_TARGET'))
      return { ok: false, error: 'Cannot split text through a spilled array.' }
    if (raw.includes('CLIPBOARD_MERGE_CONTENT'))
      return { ok: false, error: 'Unmerge the source and destination before splitting text.' }
    return { ok: false, error: clipboardErrorMessage(error) }
  }
}

export type { FileTextColumnsPlan }
