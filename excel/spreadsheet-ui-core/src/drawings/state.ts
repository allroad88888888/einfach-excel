import { atom } from '@einfach/core'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import { applyVisibleProjectionAtom, createVisibleProjectionRequest,
  issueProjectionRequestIdAtom, projectionSnapshotAtom } from '../projection'
import { validateProjectionResult } from '../projection/contracts'
import type { ProjectionSnapshot } from '../projection/types'
import type { ProjectionRevision } from '../contracts'
import type { SheetDrawing } from './types'

interface DrawingCache {
  readonly connection: RustWorkbookConnection
  readonly sheetId: string
  /** 读取时的投影修订；修订变了（编辑、撤销、结构变化）就重新读。 */
  readonly revision: ProjectionRevision
  readonly drawings: readonly SheetDrawing[]
}
const cacheAtom = atom<DrawingCache | null>(null)
cacheAtom.debugLabel = 'spreadsheet.drawings.cache'
const selectionAtom = atom<{ sheetId: string; id: string } | null>(null)
selectionAtom.debugLabel = 'spreadsheet.drawings.selection.state'
const errorAtom = atom<string | null>(null)
errorAtom.debugLabel = 'spreadsheet.drawings.error.state'

const EMPTY: readonly SheetDrawing[] = []

function currentRevision(result: ProjectionSnapshot['result']) {
  return result?.kind === 'visible-window' ? result.revision : undefined
}

/** 当前表的对象目录（按绘制顺序）；只是 Rust 目录的有界缓存，不是第二份事实。 */
export const sheetDrawingsAtom = atom((get): readonly SheetDrawing[] => {
  const cache = get(cacheAtom)
  const sheet = get(activeWorkbookSheetAtom)
  return cache && cache.sheetId === sheet?.id &&
    cache.connection === get(rustWorkbookConnectionAtom)
    ? cache.drawings : EMPTY
})
sheetDrawingsAtom.debugLabel = 'spreadsheet.drawings.sheet'

export const selectedDrawingAtom = atom((get): SheetDrawing | null => {
  const selected = get(selectionAtom)
  if (!selected || selected.sheetId !== get(activeWorkbookSheetAtom)?.id) return null
  return get(sheetDrawingsAtom).find((drawing) => drawing.id === selected.id) ?? null
})
selectedDrawingAtom.debugLabel = 'spreadsheet.drawings.selected'

export const drawingErrorAtom = atom((get) => get(errorAtom))
drawingErrorAtom.debugLabel = 'spreadsheet.drawings.error'

export const selectDrawingAtom = atom(null, (get, set, id: string | null) => {
  const sheet = get(activeWorkbookSheetAtom)
  set(selectionAtom, id && sheet ? { sheetId: sheet.id, id } : null)
  set(errorAtom, null)
})
selectDrawingAtom.debugLabel = 'spreadsheet.drawings.select'

/** 投影修订或当前表变化后重读；同一修订重复调用不发请求。 */
export const refreshSheetDrawingsAtom = atom(null, async (get, set): Promise<void> => {
  const connection = get(rustWorkbookConnectionAtom)
  const sheet = get(activeWorkbookSheetAtom)
  const revision = currentRevision(get(projectionSnapshotAtom).result)
  if (!connection || !sheet || revision === undefined) return
  const cache = get(cacheAtom)
  if (cache?.connection === connection && cache.sheetId === sheet.id && cache.revision === revision)
    return
  try {
    const reply = await connection.request('drawings.read', { sheetId: sheet.id })
    if (get(rustWorkbookConnectionAtom) !== connection ||
      get(activeWorkbookSheetAtom)?.id !== sheet.id)
      return
    if (!Array.isArray(reply.drawings)) throw new Error('Rust returned an invalid object list.')
    set(cacheAtom, { connection, sheetId: sheet.id, revision: reply.revision,
      drawings: reply.drawings })
  } catch (error) {
    set(errorAtom, error instanceof Error ? error.message : String(error))
  }
})
refreshSheetDrawingsAtom.debugLabel = 'spreadsheet.drawings.refresh'

export type DrawingChange =
  | { readonly type: 'set'; readonly drawing: SheetDrawing }
  | { readonly type: 'remove'; readonly id: string }
  | { readonly type: 'order'; readonly id: string; readonly toFront: boolean }

/** 新增、修改、移动、删除都是一次 Rust 命令、一条撤销记录、一次投影发布。 */
export const changeSheetDrawingAtom = atom(null,
  async (get, set, change: DrawingChange): Promise<boolean> => {
    const connection = get(rustWorkbookConnectionAtom)
    const sheet = get(activeWorkbookSheetAtom)
    const witness = get(projectionSnapshotAtom)
    const visible = witness.request
    if (!connection || !sheet || visible?.kind !== 'visible-window') return false
    const requestId = set(issueProjectionRequestIdAtom)
    if (requestId === null) return false
    const projection = createVisibleProjectionRequest({ sheetId: sheet.id, requestId,
      window: visible.window, viewport: visible.viewport, reason: 'toolbar' })
    try {
      const reply = change.type === 'set'
        ? await connection.request('drawings.set',
          { sheetId: sheet.id, drawing: change.drawing, projection })
        : change.type === 'order'
          ? await connection.request('drawings.reorder',
            { sheetId: sheet.id, id: change.id, toFront: change.toFront, projection })
          : await connection.request('drawings.remove',
            { sheetId: sheet.id, id: change.id, projection })
      if (get(rustWorkbookConnectionAtom) !== connection) return false
      if (typeof reply.changed !== 'boolean' || !Array.isArray(reply.drawings) ||
        !validateProjectionResult(reply.projection, { request: projection }).ok)
        throw new Error('Rust returned a mismatched object result.')
      set(applyVisibleProjectionAtom, { witness, request: projection, result: reply.projection })
      set(cacheAtom, { connection, sheetId: sheet.id,
        revision: reply.projection.revision ?? -1, drawings: reply.drawings })
      if (change.type === 'remove' && get(selectionAtom)?.id === change.id) set(selectionAtom, null)
      set(errorAtom, null)
      return reply.changed
    } catch (error) {
      set(errorAtom, error instanceof Error ? error.message : String(error))
      return false
    }
  })
changeSheetDrawingAtom.debugLabel = 'spreadsheet.drawings.change'
