import { readDrawings, removeDrawing, setDrawing } from '../drawings/command'
import type { WorkbookHandlers } from './context'

/** 浮动对象目录：读、增改、删；写入与其他元数据命令共用一次版本推进和一次投影。 */
export const drawingHandlers: WorkbookHandlers = {
  'drawings.read': (context, current, input) => ({
    drawings: readDrawings(current, context.sheetsById, input.sheetId),
    revision: context.revision,
  }),
  'drawings.set': (context, current, input) => ({
    ...context.projectChange(setDrawing(current, context.sheetsById, input), input),
    drawings: readDrawings(current, context.sheetsById, input.sheetId),
  }),
  'drawings.remove': (context, current, input) => ({
    ...context.projectChange(removeDrawing(current, context.sheetsById, input), input),
    drawings: readDrawings(current, context.sheetsById, input.sheetId),
  }),
}
