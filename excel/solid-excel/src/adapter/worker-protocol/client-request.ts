export type WorkerRpcRequest = <T>(cmd: string, payload?: Record<string, unknown>) => Promise<T>
