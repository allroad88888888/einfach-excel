import type { RustWorkbookCommands, RustWorkbookSheet } from '../rust-workbook/commands'
import type { WasmWorkbook } from '../rust-workbook/wasm-types'
import type { WorkerRequestWire } from '../rust-worker/types'
import { rpcError } from '../rust-worker/transport'
import { takeValidationErrorDetail } from '../rust-workbook/validation-error-detail'
import { assertHostCommandAllowed, DEFAULT_HOST_CONTROLS, isPersistentHostCommand, validateHostControls } from './policy'
import type { HostControls, NativeMutationState, NativeWriteWorkbookCellsResult,
  ReadWorkbookRangesInput,
  WorkbookChangeEvent, WriteWorkbookCellsInput } from './types'

interface WorkerHostContext {
  readonly scope: DedicatedWorkerGlobalScope
  workbook(): WasmWorkbook | undefined
  sheets(): ReadonlyMap<string, RustWorkbookSheet>
  revision(): number
  advanceRevision(): number
  drain(): void
}

function validRange(range: ReadWorkbookRangesInput['targets'][number]['range'],
  sheet: RustWorkbookSheet): void {
  if (!range || !Object.values(range).every(Number.isSafeInteger) || range.rowStart < 0 ||
    range.colStart < 0 || range.rowEnd < range.rowStart || range.colEnd < range.colStart ||
    range.rowEnd >= (sheet.rowCount ?? 1_048_576) || range.colEnd >= (sheet.colCount ?? 16_384))
    throw new Error('INVALID_RANGE')
}

/** 同一次 native 调用读取全部区域，异步公式结算只能发生在本消息返回之后。 */
export function readHostRanges(context: WorkerHostContext, input: ReadWorkbookRangesInput) {
  const workbook = context.workbook()!
  if (!workbook.host_read_ranges) throw new Error('Rust host read is unavailable.')
  if (!Array.isArray(input.targets) || input.targets.length > 64) throw new Error('HOST_READ_BUDGET_EXCEEDED')
  const targets = input.targets.map(({ sheetId, range }) => {
    const sheet = context.sheets().get(sheetId)
    if (!sheet) throw new Error('INVALID_SHEET')
    validRange(range, sheet)
    return { sheet: sheet.index, range }
  })
  const revision = context.revision()
  return workbook.host_read_ranges(targets).map((result, index) => ({
    sheetId: input.targets[index]!.sheetId, range: result.range, cells: result.cells, revision,
  }))
}

export function writeHostCells(context: WorkerHostContext, input: WriteWorkbookCellsInput) {
  const workbook = context.workbook()!
  if (!workbook.host_write_cells) throw new Error('Rust host write is unavailable.')
  if (input.source !== undefined && input.source !== 'api' && input.source !== 'refresh')
    throw new Error('INVALID_HOST_SOURCE')
  if (!Array.isArray(input.cells) || input.cells.length > 4096) throw new Error('HOST_WRITE_BUDGET_EXCEEDED')
  const cells = input.cells.map(({ sheetId, row, col, input: value }) => {
    const sheet = context.sheets().get(sheetId)
    if (!sheet) throw new Error('INVALID_SHEET')
    validRange({ rowStart: row, rowEnd: row, colStart: col, colEnd: col }, sheet)
    return { sheet: sheet.index, row, col, input: value }
  })
  const changed = workbook.host_write_cells(cells)
  return { changed, revision: changed ? context.advanceRevision() : context.revision() }
}

function historyStructureBlocked(workbook: WasmWorkbook | undefined, payload: unknown): boolean {
  const history = workbook?.history_state?.()
  if (!history) return false
  const direction = (payload as { direction?: string })?.direction
  const entry = history.entries[history.undoCount - (direction === 'undo' ? 1 : 0)]
  return !!entry && (!!entry.sheetChange || !!entry.structuralEdit)
}

/** 门禁、提交事实与消息排队属于工作簿业务；通用 transport 不知道这些语义。 */
export function installHostWorkerGateway(context: WorkerHostContext,
  dispatch: (command: keyof RustWorkbookCommands, payload: unknown) => Promise<unknown>): void {
  let controls: HostControls = DEFAULT_HOST_CONTROLS
  let queue = Promise.resolve()
  let lastSequence = 0
  let initialized = false

  const describe = (error: unknown): string => {
    try { return String(error) } catch { return 'Unknown workbook presentation failure.' }
  }
  const post = (value: unknown): boolean => {
    try { context.scope.postMessage(value); return true } catch { return false }
  }
  const eventFor = (message: WorkerRequestWire, fact: NativeMutationState,
    previousSheets: ReadonlyMap<string, RustWorkbookSheet>): boolean => {
    const sheets = new Map([...previousSheets.values(), ...context.sheets().values()]
      .map((sheet) => [sheet.key, sheet.id]))
    const event: Omit<WorkbookChangeEvent, 'connectionId'> = {
      operationId: `native-${fact.sequence}`, revision: context.revision(),
      source: message.command === 'history.apply' ? 'history' : message.command === 'host.writeCells'
        ? (message.payload as WriteWorkbookCellsInput).source ?? 'api' : 'user',
      kind: message.command,
      changes: fact.changes.map(({ sheetKey, ranges }) => {
        const sheetId = sheets.get(sheetKey)
        if (!sheetId) throw new Error(`Unknown native mutation sheet: ${sheetKey}`)
        return { sheetId, ranges }
      }),
    }
    if (!post({ type: 'event', event })) throw new Error('Workbook change notification could not be posted.')
    lastSequence = fact.sequence
    return true
  }

  async function run(message: WorkerRequestWire): Promise<void> {
    let previousSheets = new Map<string, RustWorkbookSheet>()
    let before: NativeMutationState | undefined
    let previousRevision: number | undefined
    let fact: NativeMutationState | undefined
    let committed = false
    let published = false
    let notificationError: unknown
    let nativeWrite: NativeWriteWorkbookCellsResult | undefined
    let drained = false
    const publish = () => {
      fact = context.workbook()?.host_mutation_state?.()
      committed = !!fact && !!before && fact.sequence !== before.sequence
      if (committed && context.revision() === previousRevision) context.advanceRevision()
      if (committed && fact && fact.sequence > lastSequence)
        published = eventFor(message, fact, previousSheets)
    }
    try {
      previousSheets = new Map(context.sheets())
      previousRevision = context.revision()
      if (initialized && ['workbook.initialize', 'workbook.openFile', 'workbook.importCells'].includes(message.command))
        throw new Error('HOST_LIFECYCLE_CLOSED')
      if (message.command === 'host.configure') {
        controls = validateHostControls(message.payload as HostControls)
        initialized = true
      }
      assertHostCommandAllowed(controls, message.command)
      if (!controls.allowSheetStructure && message.command === 'history.apply' &&
          historyStructureBlocked(context.workbook(), message.payload))
        throw Object.assign(new Error('HOST_STRUCTURE_DISABLED'), { code: 'HOST_STRUCTURE_DISABLED' })
      if (isPersistentHostCommand(message.command))
        before = context.workbook()?.host_mutation_state?.()
      if (['cell.setInput', 'clipboard.paste', 'range.fill'].includes(message.command))
        context.workbook()?.getLastValidationFailure?.()
      const result = message.command === 'host.configure' ? undefined :
        message.command === 'host.readRanges' ? readHostRanges(context, message.payload as ReadWorkbookRangesInput) :
        message.command === 'host.writeCells' ? writeHostCells(context, message.payload as WriteWorkbookCellsInput) :
        await dispatch(message.command as keyof RustWorkbookCommands, message.payload)
      if (message.command === 'host.writeCells') nativeWrite = result as NativeWriteWorkbookCellsResult
      // 提交先于投影展示；事件即使展示失败也必须可供宿主保存已经落地的修改。
      if (isPersistentHostCommand(message.command)) publish()
      drained = true
      context.drain()
      if (!post({ id: message.id, ok: true, result })) throw new Error('Workbook response could not be posted.')
    } catch (error) {
      if (before && !published && isPersistentHostCommand(message.command)) {
        try { publish() } catch (failure) { notificationError = failure }
      }
      // 身份/事件发布自身失败不能冒充回滚，也不能使本消息或后续队列无人响应。
      if (committed && !published && fact) {
        notificationError ??= error
        published = post({ type: 'event', event: {
          operationId: `native-${fact.sequence}`, revision: context.revision(),
          source: message.command === 'history.apply' ? 'history' : message.command === 'host.writeCells'
            ? (message.payload as WriteWorkbookCellsInput).source ?? 'api' : 'user',
          kind: `${message.command}.committed-unmapped`, changes: [],
        } })
        if (published) lastSequence = fact.sequence
      }
      let cause = error
      try {
        const workbook = context.workbook()
        if (workbook && ['cell.setInput', 'clipboard.paste', 'range.fill'].includes(message.command))
          cause = takeValidationErrorDetail(workbook, error)
      } catch { /* 保留提交/原始错误，诊断读取本身不再抛出。 */ }
      if (!drained) {
        try { context.drain() } catch { /* 主失败仍由原始原生结果解释。 */ }
      }
      if (nativeWrite) {
        post({ id: message.id, ok: true, result: { ...nativeWrite,
          displayError: { code: 'DISPLAY_FAILED', message: describe(cause) } } })
        return
      }
      post({ id: message.id, ok: false, error: committed
        ? { code: 'WORKBOOK_COMMITTED_PRESENTATION_FAILED', message: describe(cause), detail: {
          committed: true, ...(notificationError ? { notificationError: describe(notificationError),
            nativeMutation: fact, notificationPublished: published } : {}),
        } }
        : rpcError(cause) })
    }
  }

  async function service(message: WorkerRequestWire): Promise<void> {
    try { await run(message) } catch (error) {
      // 最外层只隔离故障消息；postMessage 失效无法保证送达，但绝不能毒化队列。
      post({ id: message.id, ok: false, error: { code: 'WORKBOOK_GATEWAY_FAILED', message: describe(error),
        detail: { commitStatus: 'unknown' } } })
    }
  }

  context.scope.addEventListener('message', (event: MessageEvent) => {
    const message = event.data as WorkerRequestWire
    if (typeof message?.id !== 'number' || typeof message.command !== 'string') return
    // 异步公式等待不占用串行命令队列，否则下一次写入无法唤醒等待者。
    if (message.command === 'formula.awaitAsync') return service(message)
    queue = queue.then(() => service(message), () => service(message))
    return queue
  })
}
