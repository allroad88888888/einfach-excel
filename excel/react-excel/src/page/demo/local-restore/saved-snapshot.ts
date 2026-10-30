import { readSavedSnapshot } from './snapshot-store'

export type InitialSnapshotState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly snapshot?: string }
  | { readonly status: 'error'; readonly message: string }

let initial: InitialSnapshotState = { status: 'loading' }
let loading: Promise<void> | null = null
let lastSavedAt: number | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

/**
 * 页面外的存储状态，供 `useSyncExternalStore` 订阅：首次订阅时从 IndexedDB 读一次初始快照，
 * 之后只记录最近保存时间。它是演示宿主的存储状态，不是工作簿状态。
 */
export function subscribeSavedSnapshot(listener: () => void): () => void {
  listeners.add(listener)
  loading ??= readSavedSnapshot().then(
    (snapshot) => { initial = { status: 'ready', ...(snapshot ? { snapshot } : {}) }; notify() },
    (error: unknown) => { initial = { status: 'error', message: String(error) }; notify() })
  return () => listeners.delete(listener)
}

export function initialSnapshotState(): InitialSnapshotState {
  return initial
}

export function lastSnapshotSavedAt(): number | null {
  return lastSavedAt
}

export function markSnapshotSaved() {
  lastSavedAt = Date.now()
  notify()
}
