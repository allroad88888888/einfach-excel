import { atom } from '@einfach/core'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustFindRequest, RustFindMatch } from '../rust-workbook/find-commands'
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
