export interface WorkerLike {
  postMessage(message: unknown): void
  addEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void
  removeEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void
  terminate(): void
}

export type WorkerFactory = () => WorkerLike
