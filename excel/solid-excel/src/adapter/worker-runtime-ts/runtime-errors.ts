import type { RpcErrorWire } from '../worker-protocol'

export type RequestMessage = {
  id?: number
  cmd?: string
  [key: string]: unknown
}

export function rpcError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code })
}

/** Refuse unavailable worker features with the standard RPC error shape. */
export function unsupported(feature: string): never {
  throw rpcError('UNSUPPORTED', `${feature} is not implemented by the TS worker runtime`)
}

export function toRpcError(error: unknown): RpcErrorWire {
  return error instanceof Error
    ? {
        code: String((error as Error & { code?: string }).code ?? 'WORKER_ERROR'),
        message: error.message,
      }
    : { code: 'WORKER_ERROR', message: String(error) }
}
