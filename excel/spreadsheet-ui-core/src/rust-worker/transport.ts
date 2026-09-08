import type {
  CommandPayload,
  CommandResult,
  WorkerCommandMap,
  WorkerErrorWire,
  WorkerLike,
  WorkerResponseWire,
} from './types'

type PendingRequest = {
  resolve(value: unknown): void
  reject(reason?: unknown): void
}

/** 一个连接只负责相关联的 Worker 请求、响应和释放。 */
export interface WorkerTransport<Commands extends WorkerCommandMap> {
  request<Name extends keyof Commands & string>(
    command: Name,
    payload: CommandPayload<Commands, Name>,
  ): Promise<CommandResult<Commands, Name>>
  dispose(): void
}

function responseError(error: WorkerErrorWire): Error {
  return Object.assign(new Error(error.message), {
    code: error.code,
    ...(error.detail === undefined ? {} : { detail: error.detail }),
  })
}

/** 与 responseError 对应的发送端转换，协议错误不属于工作簿业务。 */
export function rpcError(error: unknown): WorkerErrorWire {
  if (!(error instanceof Error)) return { code: 'WORKER_ERROR', message: String(error) }
  const typed = error as Error & { code?: string; detail?: unknown }
  return {
    code: typed.code ?? 'WORKER_ERROR',
    message: typed.message,
    ...(typed.detail === undefined ? {} : { detail: typed.detail }),
  }
}

/** 创建与业务无关的类型化 Worker RPC 传输。 */
export function createWorkerTransport<Commands extends WorkerCommandMap>(
  workerFactory: () => WorkerLike,
): WorkerTransport<Commands> {
  const worker = workerFactory()
  const pending = new Map<number, PendingRequest>()
  let nextRequestId = 1
  let disposed = false
  let workerFailure: Error | undefined

  const onMessage = (event: MessageEvent) => {
    const response = event.data as WorkerResponseWire
    if (typeof response?.id !== 'number' || typeof response.ok !== 'boolean') return
    const request = pending.get(response.id)
    if (!request) return
    pending.delete(response.id)
    if (response.ok) request.resolve(response.result)
    else request.reject(responseError(response.error))
  }
  worker.addEventListener('message', onMessage)

  const eventWorker = worker as WorkerLike & {
    addEventListener(type: string, listener: (event: Event) => void): void
    removeEventListener(type: string, listener: (event: Event) => void): void
  }
  const fail = (event: Event) => {
    const source = event as ErrorEvent
    const error = new Error(source.message || `Worker ${event.type}`)
    workerFailure = error
    for (const request of pending.values()) request.reject(error)
    pending.clear()
  }
  eventWorker.addEventListener('error', fail)
  eventWorker.addEventListener('messageerror', fail)

  return {
    request(command, payload) {
      if (disposed) return Promise.reject(new Error('Worker transport has been disposed'))
      if (workerFailure) return Promise.reject(workerFailure)
      const id = nextRequestId++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        try {
          worker.postMessage({ id, command, payload })
        } catch (error) {
          pending.delete(id)
          reject(error)
        }
      })
    },
    dispose() {
      if (disposed) return
      disposed = true
      worker.removeEventListener('message', onMessage)
      eventWorker.removeEventListener('error', fail)
      eventWorker.removeEventListener('messageerror', fail)
      for (const request of pending.values()) {
        request.reject(new Error('Worker transport has been disposed'))
      }
      pending.clear()
      worker.terminate()
    },
  }
}
