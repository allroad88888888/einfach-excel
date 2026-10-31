import { atom } from '@einfach/core'
import {
  applyVisibleProjectionAtom,
  createVisibleProjectionRequest,
  issueProjectionRequestIdAtom,
  projectionSnapshotAtom,
} from '../projection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustDragTransferRequest } from '../rust-workbook/drag-move/command'
import type { CellRange } from '../shared'

export type DragTransferOutcome =
  | { readonly status: 'applied'; readonly range: CellRange }
  | { readonly status: 'occupied' }

/** 一次 range.dragTransfer：严格核对 ACK，再直接发布同修订版可见区，不做第二次刷新。 */
export const requestDragTransferAtom = atom(null, async (
  get, set, input: Omit<RustDragTransferRequest, 'requestId'>,
): Promise<DragTransferOutcome> => {
  const connection = get(rustWorkbookConnectionAtom)
  const witness = get(projectionSnapshotAtom)
  const visible = witness.request
  if (!connection || visible?.kind !== 'visible-window' || visible.sheetId !== input.sheetId)
    throw new Error('Wait for the selected sheet to load.')
  const requestId = set(issueProjectionRequestIdAtom)
  if (requestId === null) throw new Error('The workbook is unavailable.')
  const projection = createVisibleProjectionRequest({
    sheetId: input.sheetId, window: visible.window, viewport: visible.viewport,
    requestId, reason: 'toolbar',
  })
  let result
  try {
    result = await connection.request('range.dragTransfer', {
      request: { ...input, requestId }, projection,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'DRAG_TARGET_NOT_EMPTY')
      return { status: 'occupied' }
    throw error
  }
  if (get(rustWorkbookConnectionAtom) !== connection)
    throw new Error('The workbook changed. Drag the cells again.')
  const ack = result.acknowledgement
  if (ack.sheetId !== input.sheetId || ack.requestId !== requestId ||
    ack.revision !== result.projection.revision || !ack.affectedRange)
    throw new Error('Invalid drag move acknowledgement.')
  // 用户在请求期间滚动时投影会被判为过期；滚动读取本身会带回新数据。
  set(applyVisibleProjectionAtom, { witness, request: projection, result: result.projection })
  return { status: 'applied', range: ack.affectedRange }
})
requestDragTransferAtom.debugLabel = 'spreadsheet.dragMove.requestTransfer'
