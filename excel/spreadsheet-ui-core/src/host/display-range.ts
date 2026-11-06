import { atom } from '@einfach/core'
import type { CellRange } from '../shared'
import type { VisibleProjectionResult } from '../contracts'
import { workbookDocumentAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { createVisibleProjectionRequest, validateProjectionResult } from '../projection/contracts'
import { issueProjectionRequestIdAtom } from '../projection/state'
import { hostCommandError } from './errors'
import type { HostCommandFailure } from './types'

export interface ReadWorkbookDisplayRangeInput {
  readonly sheetId: string
  readonly range: CellRange
}
export const MAX_DISPLAY_RANGE_CELLS = 65_536
export type ReadWorkbookDisplayRangeResult =
  | { status: 'ok'; snapshot: VisibleProjectionResult }
  | HostCommandFailure

/** A bounded, point-in-time Rust display read. It never replaces the scrolling projection. */
export const readWorkbookDisplayRangeAtom = atom(null, async (
  get, set, input: ReadWorkbookDisplayRangeInput,
): Promise<ReadWorkbookDisplayRangeResult> => {
  try {
    const sheet = get(workbookDocumentAtom).sheets.find((entry) => entry.id === input.sheetId)
    const connection = get(rustWorkbookConnectionAtom)
    if (!sheet || !connection) throw new Error('The workbook is not ready.')
    const range = { ...input.range }
    const { rowStart, rowEnd, colStart, colEnd } = range
    if (![rowStart, rowEnd, colStart, colEnd].every(Number.isSafeInteger)
      || rowStart < 0 || colStart < 0 || rowEnd < rowStart || colEnd < colStart
      || rowEnd >= sheet.rowCount || colEnd >= sheet.colCount)
      throw new Error('Choose a range inside the worksheet.')
    if ((rowEnd - rowStart + 1) * (colEnd - colStart + 1) > MAX_DISPLAY_RANGE_CELLS)
      throw new Error('Choose at most 65,536 cells for a display range read.')
    const requestId = set(issueProjectionRequestIdAtom)
    if (requestId === null) throw new Error('The workbook is not ready.')
    const request = createVisibleProjectionRequest({
      sheetId: sheet.id, requestId, window: range, reason: 'toolbar',
    })
    const result = await connection.request('projection.readVisible', { request })
    if (get(rustWorkbookConnectionAtom) !== connection)
      throw new Error('WORKBOOK_CONNECTION_REPLACED')
    const validation = validateProjectionResult(result, {
      request, maxCells: MAX_DISPLAY_RANGE_CELLS,
    })
    if (!validation.ok || result.truncated)
      throw new Error('Rust returned an incomplete display range.')
    return { status: 'ok', snapshot: result }
  } catch (error) { return { status: 'error', error: hostCommandError(error) } }
})
readWorkbookDisplayRangeAtom.debugLabel = 'spreadsheet.host.readDisplayRange'
