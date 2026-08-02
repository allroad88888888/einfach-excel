import type { WorkerWasmModule } from './wasm-workbook-surface'
import type { RequestMessage, WorkerCommandHandler } from './worker-command'
import { handleCellCommand } from './worker-commands-cells'
import { handleFilterSortCommand } from './worker-commands-filter-sort'
import { handleFormatCommand } from './worker-commands-format'
import { handleSessionCommand } from './worker-commands-sessions'
import { handleSnapshotCommand } from './worker-commands-snapshot'
import { handleSpillCommand } from './worker-commands-spill'
import { handleStructureCommand } from './worker-commands-structure'
import { handleTableCommand } from './worker-commands-tables'
import { handleWorkbookCommand } from './worker-commands-workbook'
import { asyncCustomPump, handleCustomFormulaCommand } from './worker-custom-formulas'
import { postError, workerScope } from './worker-post'
import { toRpcError } from './worker-rejections'
import { handleSubscriptionCommand } from './worker-session-registry'
import { bindWasmModule, ensureInit, ensureWorkbook } from './worker-workbook-host'

/**
 * WASM worker 的消息循环。**不知道**自己跑在哪一份 wasm 产物上 —— 模块命名空间
 * 由薄入口注入（`worker-runtime.ts` 给 lite，`worker-runtime-full.ts` 给 full），
 * 宿主也可以自己写一个入口，喂进自建的 `wasm-pack` 产物。
 *
 * 每族命令住在自己的 `worker-commands-*.ts` 里；这里只负责按顺序问一遍谁认得，
 * 都不认得就报 `UNKNOWN_COMMAND`。
 */

const COMMAND_HANDLERS: WorkerCommandHandler[] = [
  handleWorkbookCommand,
  handleCellCommand,
  handleStructureCommand,
  handleFormatCommand,
  handleFilterSortCommand,
  handleTableCommand,
  handleSessionCommand,
  handleSnapshotCommand,
  handleSpillCommand,
  handleSubscriptionCommand,
  handleCustomFormulaCommand,
]

let workerRuntimeInstalled = false

export function installWorkerRuntime(wasm: WorkerWasmModule) {
  if (workerRuntimeInstalled) return
  workerRuntimeInstalled = true
  bindWasmModule(wasm)

  workerScope.addEventListener('message', async (e: MessageEvent) => {
    const msg = e.data as RequestMessage
    if (typeof msg.id !== 'number') return
    const id = msg.id

    try {
      await ensureInit()
      const wb = await ensureWorkbook()
      let handled = false
      for (const handle of COMMAND_HANDLERS) {
        if (handle(id, msg, wb)) {
          handled = true
          break
        }
      }
      if (!handled) {
        throw Object.assign(new Error(`unknown command: ${String(msg.cmd)}`), {
          code: 'UNKNOWN_COMMAND',
        })
      }
    } catch (err) {
      postError(id, toRpcError(err))
    } finally {
      // Wave 8.2: any command can surface new async custom-formula
      // requests (reads evaluate formulas lazily; settles cascade).
      // Fire-and-forget — an empty drain is near-free, and settles
      // notify the host through the normal subscription dirty path.
      asyncCustomPump.pump()
    }
  })
}
