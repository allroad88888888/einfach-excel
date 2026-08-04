import type { WorkerLike } from '@einfach/solid-excel/vnext'

interface WorkerMessageCounter {
  sent(): void
  received(): void
}

/** Wraps the actual worker boundary without changing its protocol or payloads. */
export function createCountingWorkerFactory(
  createWorker: () => WorkerLike,
  counter: WorkerMessageCounter,
): () => WorkerLike {
  return () => {
    const worker = createWorker()
    const listeners = new Map<(event: MessageEvent) => void, (event: MessageEvent) => void>()

    return {
      postMessage(message) {
        counter.sent()
        worker.postMessage(message)
      },
      addEventListener(type, listener) {
        const wrapped = (event: MessageEvent) => {
          counter.received()
          listener(event)
        }
        listeners.set(listener, wrapped)
        worker.addEventListener(type, wrapped)
      },
      removeEventListener(type, listener) {
        const wrapped = listeners.get(listener) ?? listener
        listeners.delete(listener)
        worker.removeEventListener(type, wrapped)
      },
      terminate() {
        worker.terminate()
      },
    }
  }
}
