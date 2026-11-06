import { atom } from '@einfach/core'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustFindRequest, RustFindMatch } from '../rust-workbook/find-commands'
import type { SheetDrawing } from '../drawings/types'
import type { HostCommandFailure } from './types'
import { hostCommandError } from './errors'

export type FindWorkbookResult = HostCommandFailure | { status: 'ok'; total: number;
  matches: readonly RustFindMatch[]; revision: number }
export const findWorkbookAtom = atom(null, async (get, _set, input: RustFindRequest):
  Promise<FindWorkbookResult> => {
  try {
    const connection = get(rustWorkbookConnectionAtom)
    if (!connection) throw new Error('The workbook is not ready.')
    const result = await connection.request('workbook.find', input)
    if (get(rustWorkbookConnectionAtom) !== connection) throw new Error('WORKBOOK_CONNECTION_REPLACED')
    return { status: 'ok', ...result }
  } catch (error) { return { status: 'error', error: hostCommandError(error) } }
})
findWorkbookAtom.debugLabel = 'spreadsheet.host.find'

export type ReadWorkbookDrawingsResult = HostCommandFailure | { status: 'ok';
  drawings: readonly SheetDrawing[] }
/** 一张表的浮动对象目录（按绘制顺序）；表不必是当前表，对象的含义由各插件解释。 */
export const readWorkbookDrawingsAtom = atom(null, async (get, _set, sheetId: string):
  Promise<ReadWorkbookDrawingsResult> => {
  try {
    const connection = get(rustWorkbookConnectionAtom)
    if (!connection) throw new Error('The workbook is not ready.')
    const result = await connection.request('drawings.read', { sheetId })
    if (get(rustWorkbookConnectionAtom) !== connection) throw new Error('WORKBOOK_CONNECTION_REPLACED')
    return { status: 'ok', drawings: result.drawings }
  } catch (error) { return { status: 'error', error: hostCommandError(error) } }
})
readWorkbookDrawingsAtom.debugLabel = 'spreadsheet.host.readDrawings'
