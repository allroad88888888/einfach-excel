/** Worker RPC 只关心命令名、负载和返回值，不关心电子表格业务。 */
export interface WorkerCommand<Payload, Result> {
  readonly payload: Payload
  readonly result: Result
}

export type WorkerCommandMap = object

export interface WorkerLike {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void
  terminate(): void
}

export interface WorkerRequestWire {
  readonly id: number
  readonly command: string
  readonly payload: unknown
}

export interface WorkerErrorWire {
  readonly code: string
  readonly message: string
  readonly detail?: unknown
}

export type WorkerResponseWire =
  | { readonly id: number; readonly ok: true; readonly result?: unknown }
  | { readonly id: number; readonly ok: false; readonly error: WorkerErrorWire }

export type CommandPayload<Commands, Name extends keyof Commands> =
  Commands[Name] extends WorkerCommand<infer Payload, unknown> ? Payload : never

export type CommandResult<Commands, Name extends keyof Commands> =
  Commands[Name] extends WorkerCommand<unknown, infer Result> ? Result : never
