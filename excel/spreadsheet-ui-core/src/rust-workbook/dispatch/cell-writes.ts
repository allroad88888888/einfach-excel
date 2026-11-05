import type { BackendMutationResult } from '../../contracts'
import type { WasmWorkbook } from '../wasm-types'
import { writeTrackedMutation } from '../tracked-mutation'
import { readSizes } from '../size-io'
import { readVisibleProjection } from '../visible-projection'
import type { CommandPayload, RuntimeContext, WorkbookHandlers } from './context'

type CellWriteCommand =
  'cell.setInput' | 'format.setRange' | 'range.clear' | 'range.fill' | 'clipboard.paste'

/** 单元格写入共用一条路径：严格 ACK + 同修订版可见区投影。 */
function writeCells(
  command: CellWriteCommand,
  context: RuntimeContext,
  current: WasmWorkbook,
  { request, projection }: CommandPayload<CellWriteCommand>,
) {
  if ('validationConfirmation' in request && request.validationConfirmation !== undefined) {
    if (request.validationConfirmation !== 'continue' ||
      request.validationRevision !== context.revision)
      throw new Error('The workbook changed. Submit the operation again.')
  }
  // 跨表公式编辑：写入原单元格，但返回正在浏览表的真实投影。
  if (command !== 'cell.setInput' && projection.sheetId !== request.sheetId) {
    throw Object.assign(new Error('Mutation and projection must target the same sheet'), {
      code: 'PROJECTION_SHEET_MISMATCH',
    })
  }
  // 先校验浏览表存在，不能写完才发现投影目标已失效。
  const projectionSheet = context.sheetIndex(projection.sheetId)
  const fontSizeWrite = 'format' in request && request.format?.fontSize !== undefined
  if (fontSizeWrite && !current.snapshot_viewport_sizes)
    throw new Error('Rust size snapshot is unavailable.')
  let affectedRange
  let colWidths
  if ('text' in request) {
    const clipboard = context.clipboard
    if (!current.paste_clipboard) throw new Error('Rust paste export is unavailable')
    if (request.mode === 'column-widths' && !current.snapshot_viewport_sizes)
      throw new Error('Rust size snapshot is unavailable.')
    const internal = !!request.token &&
      request.token === (request.painter ? context.painterToken : clipboard?.token)
    if (request.painter && !internal) throw new Error('CLIPBOARD_SHEET_HISTORY_CHANGED')
    if (!request.painter && internal && clipboard?.consumed) throw new Error('CLIPBOARD_CUT_CONSUMED')
    if (!request.painter && internal && clipboard?.invalidated)
      throw new Error('CLIPBOARD_SHEET_HISTORY_CHANGED')
    const range = current.paste_clipboard(
      context.sheetIndex(request.sheetId),
      request.row,
      request.col,
      request.text,
      internal,
      request,
    )
    affectedRange = {
      rowStart: range[0],
      colStart: range[1],
      rowEnd: range[2],
      colEnd: range[3],
    }
    if (request.mode === 'column-widths')
      colWidths = readSizes(current, context.sheetIndex(request.sheetId), affectedRange).colWidths
    if (!request.painter && internal && clipboard?.cut) clipboard.consumed = true
  } else {
    affectedRange = writeTrackedMutation(
      current, context.sheetIndex(request.sheetId), request, context.sheetIndex,
    )
  }
  context.revision += 1
  const acknowledgement: BackendMutationResult = {
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision: context.revision,
    affectedRange,
  }
  return {
    acknowledgement,
    ...('direction' in request || fontSizeWrite
      ? { sizes: readSizes(current, context.sheetIndex(request.sheetId),
        'direction' in request && !request.adjacent ? request.range : affectedRange) } : {}),
    ...(colWidths ? { colWidths } : {}),
    projection: readVisibleProjection(
      current,
      projectionSheet,
      projection,
      context.revision,
    ),
  }
}

export const cellWriteHandlers: WorkbookHandlers = {
  'cell.setInput': (context, current, input) => writeCells('cell.setInput', context, current, input),
  'format.setRange': (context, current, input) =>
    writeCells('format.setRange', context, current, input),
  'range.clear': (context, current, input) => writeCells('range.clear', context, current, input),
  'range.fill': (context, current, input) => writeCells('range.fill', context, current, input),
  'clipboard.paste': (context, current, input) =>
    writeCells('clipboard.paste', context, current, input),
}
