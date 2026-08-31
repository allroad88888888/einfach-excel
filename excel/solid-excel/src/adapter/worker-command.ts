import type { WasmWorkbookRuntime } from './wasm-workbook-surface'

/** 宿主发来的 RPC 请求信封 —— `cmd` 之外的字段由各命令自行解释。 */
export type RequestMessage = {
  id?: number
  cmd?: string
  [key: string]: unknown
}

/**
 * 一族命令的处理器：认得 `msg.cmd` 就处理并返回 `true`，认不得返回 `false`
 * 交给下一族。响应由处理器自己投递（正常响应与结构化拒绝的形状各不相同），
 * 抛出的异常统一由消息循环转成 RPC error。
 */
export type WorkerCommandHandler = (
  id: number,
  msg: RequestMessage,
  wb: WasmWorkbookRuntime,
) => boolean
