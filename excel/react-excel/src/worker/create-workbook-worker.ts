import type { WorkerLike } from '@einfach/spreadsheet-ui-core/rust-worker'

/** 挂载时才创建 Worker；Core runtime 独占其终止权，工厂不能共享活动实例。 */
export function createDefaultWorkbookWorker(): WorkerLike {
  return new Worker(new URL('./workbook.worker.ts', import.meta.url), { type: 'module' })
}
