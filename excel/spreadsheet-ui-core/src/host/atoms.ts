import { atom } from '@einfach/core'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { projectionSnapshotAtom } from '../projection/state'
import { runVisibleProjectionAtom } from '../projection/run-visible-projection'
import { hostControlsBackingAtom } from './state'
import { assertHostCommandAllowed, validateHostControls } from './policy'
import type { HostControls, ReadWorkbookRangesInput, ReadWorkbookRangesResult,
  WriteWorkbookCellsInput, WriteWorkbookCellsResult, ConfigureHostControlsResult } from './types'
import { hostCommandError } from './errors'

export const configureHostControlsAtom = atom(null,
  async (get, set, input: Partial<HostControls>): Promise<ConfigureHostControlsResult> => {
    try {
      const controls = validateHostControls({ ...get(hostControlsBackingAtom), ...input })
      set(hostControlsBackingAtom, controls)
      const connection = get(rustWorkbookConnectionAtom)
      if (connection) await connection.request('host.configure', controls)
      return { status: 'ok' }
    } catch (error) { return { status: 'error', error: hostCommandError(error) } }
  })

export const readWorkbookRangesAtom = atom(null,
  async (get, _set, input: ReadWorkbookRangesInput): Promise<ReadWorkbookRangesResult> => {
    try {
      const connection = get(rustWorkbookConnectionAtom)
      if (!connection) throw new Error('The workbook is not ready.')
      const result = await connection.request('host.readRanges', input)
      if (get(rustWorkbookConnectionAtom) !== connection) throw new Error('WORKBOOK_CONNECTION_REPLACED')
      return { status: 'ok', ranges: result }
    } catch (error) { return { status: 'error', error: hostCommandError(error) } }
  })

/** 原生批量写入一次提交；现有投影命令只负责将结果重新展示到当前可见窗口。 */
export const writeWorkbookCellsAtom = atom(null,
  async (get, set, input: WriteWorkbookCellsInput): Promise<WriteWorkbookCellsResult> => {
    let committed
    try {
      const connection = get(rustWorkbookConnectionAtom)
      if (!connection) throw new Error('The workbook is not ready.')
      assertHostCommandAllowed(get(hostControlsBackingAtom), 'host.writeCells')
      const result = await connection.request('host.writeCells', input)
      if (get(rustWorkbookConnectionAtom) !== connection) throw new Error('WORKBOOK_CONNECTION_REPLACED')
      committed = result
      const request = get(projectionSnapshotAtom).request
      if (result.changed && request?.kind === 'visible-window') {
        const display = await set(runVisibleProjectionAtom, { sheetId: request.sheetId,
          window: request.window,
          viewport: request.viewport, reason: 'viewport', retainResult: true })
        if (display.status === 'failed')
          return { status: 'ok', ...result, displayError: { code: 'DISPLAY_FAILED', message: display.error } }
      }
      return { status: 'ok', ...result }
    } catch (error) {
      return committed ? { status: 'ok', ...committed, displayError: hostCommandError(error) }
        : { status: 'error', error: hostCommandError(error, true) }
    }
  })
