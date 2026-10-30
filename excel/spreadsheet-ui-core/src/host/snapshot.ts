import { atom } from '@einfach/core'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { workbookDocumentAtom } from '../runtime/workbook-document'
import { replaceRustWorkbookRuntimeAtom } from '../runtime/rust-workbook-runtime'
import { WORKBOOK_FILE_MAX_BYTES } from '../rust-workbook/file-commands'
import { workbookReplacementErrorAtom } from './state'
import { hostCommandError } from './errors'
import type { ExportWorkbookSnapshotResult, OpenWorkbookSnapshotResult } from './types'

/**
 * 整簿原生快照（与 `.einfach.json` 同格式）。宿主自己决定存到哪里；组件不碰任何存储。
 * readOnly 下仍可导出。
 */
export const exportWorkbookSnapshotAtom = atom(null,
  async (get): Promise<ExportWorkbookSnapshotResult> => {
    try {
      const connection = get(rustWorkbookConnectionAtom)
      if (!connection) throw new Error('The workbook is not ready.')
      const file = await connection.request('workbook.exportFile', {
        title: get(workbookDocumentAtom).title,
      })
      if (get(rustWorkbookConnectionAtom) !== connection) throw new Error('WORKBOOK_CONNECTION_REPLACED')
      return { status: 'ok', snapshot: file.text, title: get(workbookDocumentAtom).title }
    } catch (error) { return { status: 'error', error: hostCommandError(error) } }
  })
exportWorkbookSnapshotAtom.debugLabel = 'spreadsheet.host.exportSnapshot'

/** 用快照替换当前工作簿；失败时保留旧簿。成功后 `workbookChangeAtom` 发一次 import。 */
export const openWorkbookSnapshotAtom = atom(null,
  async (get, set, snapshot: string): Promise<OpenWorkbookSnapshotResult> => {
    try {
      if (typeof snapshot !== 'string' || snapshot.length === 0 ||
        snapshot.length > WORKBOOK_FILE_MAX_BYTES)
        throw new Error('A workbook snapshot must be a non-empty string up to 64 MiB.')
      if (await set(replaceRustWorkbookRuntimeAtom, snapshot)) return { status: 'ok' }
      throw get(workbookReplacementErrorAtom) ?? new Error('The workbook changed while opening.')
    } catch (error) { return { status: 'error', error: hostCommandError(error) } }
  })
openWorkbookSnapshotAtom.debugLabel = 'spreadsheet.host.openSnapshot'
