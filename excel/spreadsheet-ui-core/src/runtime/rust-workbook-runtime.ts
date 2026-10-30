import { atom, type Getter } from '@einfach/core'
import { createRustWorkbookConnection, type RustWorkbookConnection } from '../rust-workbook'
import type { WorkerLike } from '../rust-worker'
import { editingSessionAtom } from '../editing/session-atoms'
import { watchAsyncFormulaSettlementsAtom } from '../async-formulas/watch-settlements'
import { resetWorkbookViewAtom } from './reset-workbook-view'
import { hostControlsBackingAtom, workbookReplacementErrorBackingAtom } from '../host/state'
import { hostCommandError } from '../host/errors'
import { assertHostCommandAllowed } from '../host/policy'
import { synchronizeHostControls } from '../host/binding'
import { publishNativeFunctionCatalogAtom, validateFunctionCatalog } from '../formula-functions/native-catalog'
import {
  beginSpreadsheetRuntimeAtom,
  rejectSpreadsheetRuntimeAtom,
  resolveSpreadsheetRuntimeAtom,
} from './workbook-lifecycle'
import { clearWorkbookDocumentAtom, initializeWorkbookDocumentAtom } from './workbook-document'
import { openedWorkbookSheets } from './opened-workbook-sheets'
import { loadWorkbookDefinition, type LoadedWorkbook } from './load-workbook-definition'
import {
  snapshotRustWorkbookDefinition,
  type StartRustWorkbookRuntimeInput,
} from './rust-workbook-definition'

interface RuntimeOwner {
  readonly sessionId: number
  readonly connection: RustWorkbookConnection | null
  readonly workerFactory?: () => WorkerLike
}

const EMPTY_RUNTIME_OWNER: RuntimeOwner = Object.freeze({ sessionId: 0, connection: null })
const runtimeOwnerAtom = atom<RuntimeOwner>(EMPTY_RUNTIME_OWNER)

runtimeOwnerAtom.debugLabel = 'spreadsheet.runtime.owner'

function nextSessionId(current: number): number {
  return current === Number.MAX_SAFE_INTEGER ? 1 : current + 1
}

function ownsConnection(
  get: Getter,
  sessionId: number,
  connection: RustWorkbookConnection,
): boolean {
  const owner = get(runtimeOwnerAtom)
  return owner.sessionId === sessionId && owner.connection === connection
}

function disposeConnection(connection: RustWorkbookConnection | null): void {
  try {
    connection?.dispose()
  } catch {
    // Disposal is best-effort; the core state is cleared regardless.
  }
}

/** Starts one Rust workbook and publishes it through the UI-core runtime atoms. */
export const startRustWorkbookRuntimeAtom = atom(
  null,
  async (get, set, input: StartRustWorkbookRuntimeInput): Promise<void> => {
    const previous = get(runtimeOwnerAtom)
    disposeConnection(previous.connection)
    const sessionId = nextSessionId(previous.sessionId)
    set(runtimeOwnerAtom, Object.freeze({ sessionId, connection: null }))
    set(resetWorkbookViewAtom)
    set(clearWorkbookDocumentAtom)
    set(beginSpreadsheetRuntimeAtom)
    set(workbookReplacementErrorBackingAtom, null)

    let definition
    let connection: RustWorkbookConnection
    try {
      definition = snapshotRustWorkbookDefinition(input.definition)
      connection = createRustWorkbookConnection(input.workerFactory)
    } catch (error) {
      if (get(runtimeOwnerAtom).sessionId === sessionId) set(rejectSpreadsheetRuntimeAtom, error)
      return
    }
    set(runtimeOwnerAtom, Object.freeze({
      sessionId, connection, workerFactory: input.workerFactory,
    }))
    const owned = () => ownsConnection(get, sessionId, connection)

    let workbook: LoadedWorkbook | null = null
    if (input.snapshot !== undefined) {
      try {
        const metadata = await connection.request('workbook.openFile', {
          text: input.snapshot, idPrefix: `workbook-${sessionId}`,
        })
        if (!owned()) return
        workbook = { title: metadata.title, sheets: openedWorkbookSheets(metadata.sheets) }
      } catch (error) {
        if (!owned()) return
        // 宿主存的快照坏了不该让页面打不开：报给宿主，换一个干净 Worker 按定义启动。
        set(workbookReplacementErrorBackingAtom, hostCommandError(error))
        disposeConnection(connection)
        connection = createRustWorkbookConnection(input.workerFactory)
        set(runtimeOwnerAtom, Object.freeze({
          sessionId, connection, workerFactory: input.workerFactory,
        }))
      }
    }

    try {
      workbook ??= await loadWorkbookDefinition(connection, definition, owned)
      if (!workbook || !owned()) return
      const catalog = validateFunctionCatalog(await connection.request('formula.catalog', {}))
      if (!ownsConnection(get, sessionId, connection)) return
      await synchronizeHostControls(get, connection)
      if (!ownsConnection(get, sessionId, connection)) return
      set(publishNativeFunctionCatalogAtom, { connection, catalog })
      set(initializeWorkbookDocumentAtom, workbook)
      set(resolveSpreadsheetRuntimeAtom, { connection })
      set(watchAsyncFormulaSettlementsAtom, connection)
    } catch (error) {
      if (!ownsConnection(get, sessionId, connection)) return
      disposeConnection(connection)
      set(runtimeOwnerAtom, Object.freeze({ sessionId, connection: null }))
      set(clearWorkbookDocumentAtom)
      set(rejectSpreadsheetRuntimeAtom, error)
    }
  },
)
startRustWorkbookRuntimeAtom.debugLabel = 'spreadsheet.runtime.startRustWorkbook'

/** 文件替换先在候选 Worker 完成；失败或旧页面已离开时保留原连接。null 表示新建。 */
export const replaceRustWorkbookRuntimeAtom = atom(
  null,
  async (get, set, text: string | null): Promise<boolean> => {
    const previous = get(runtimeOwnerAtom)
    set(workbookReplacementErrorBackingAtom, null)
    let candidate: RustWorkbookConnection | undefined
    try {
      assertHostCommandAllowed(get(hostControlsBackingAtom), 'workbook.openReplacement')
      if (!previous.connection || !previous.workerFactory)
        throw new Error('The workbook is not ready.')
      if (get(editingSessionAtom).source) throw new Error('Finish editing the cell first.')
      const sessionId = nextSessionId(previous.sessionId)
      candidate = createRustWorkbookConnection(previous.workerFactory)
      const metadata = text === null ? {
        title: 'Untitled workbook',
        sheets: await candidate.request('workbook.initialize', { sheets: [{
          id: `workbook-${sessionId}-0`, name: 'Sheet1', rowCount: 1_048_576, colCount: 16_384,
        }] }),
      } : await candidate.request('workbook.openFile', { text, idPrefix: `workbook-${sessionId}` })
      if (get(runtimeOwnerAtom) !== previous) return false
      if (get(editingSessionAtom).source) throw new Error('Finish editing the cell first.')
      const sheets = openedWorkbookSheets(metadata.sheets)
      const catalog = validateFunctionCatalog(await candidate.request('formula.catalog', {}))
      await synchronizeHostControls(get, candidate)
      if (get(runtimeOwnerAtom) !== previous) return false
      if (get(editingSessionAtom).source) throw new Error('Finish editing the cell first.')
      // 候选等待期间控制可能收紧；交换所有权前必须按当前 Store 再次门禁。
      assertHostCommandAllowed(get(hostControlsBackingAtom), 'workbook.openReplacement')
      // 只有此处切换所有权；旧请求随后拒绝，不能再填入新工作簿的投影队列。
      set(runtimeOwnerAtom, {
        sessionId, connection: candidate, workerFactory: previous.workerFactory,
      })
      set(resetWorkbookViewAtom)
      set(publishNativeFunctionCatalogAtom, { connection: candidate, catalog })
      set(initializeWorkbookDocumentAtom, { title: metadata.title, sheets })
      set(resolveSpreadsheetRuntimeAtom, { connection: candidate })
      set(watchAsyncFormulaSettlementsAtom, candidate)
      disposeConnection(previous.connection)
      return true
    } catch (error) {
      if (get(runtimeOwnerAtom) === previous)
        set(workbookReplacementErrorBackingAtom, hostCommandError(error))
      return false
    } finally {
      if (candidate && get(runtimeOwnerAtom).connection !== candidate) disposeConnection(candidate)
    }
  },
)

/** Disposes the Rust connection owned by the current UI-core store. */
export const disposeRustWorkbookRuntimeAtom = atom(null, (get, set): void => {
  const current = get(runtimeOwnerAtom)
  disposeConnection(current.connection)
  set(
    runtimeOwnerAtom,
    Object.freeze({ sessionId: nextSessionId(current.sessionId), connection: null }),
  )
  set(resetWorkbookViewAtom)
  set(clearWorkbookDocumentAtom)
  set(beginSpreadsheetRuntimeAtom)
})
disposeRustWorkbookRuntimeAtom.debugLabel = 'spreadsheet.runtime.disposeRustWorkbook'
