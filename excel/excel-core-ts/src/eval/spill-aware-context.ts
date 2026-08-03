/**
 * 求值器内部扩展的 `EvalContext` 形状。
 *
 * 职责：声明求值器在公开契约 `EvalContext` 之外**捎带**的那几个内部字段。
 */
import type { EvalContext, Value } from '../types'
import type { SpillProjectionRun } from './spill-projection-run'

/**
 * 求值器内部在 `EvalContext` 上捎带的投影账本。
 *
 * 刻意**不进**公开契约 `EvalContext`：宿主不实现它，它也只在一次 trampoline 运行
 * 内有意义。缺席时（宿主自造 ctx 的直测）投影格读回空，与本能力落地前一致。
 */
export type SpillAwareContext = EvalContext & {
  readonly spillProjection?: SpillProjectionRun
  /** 不折叠数组的单格读。只有 `A1#` 走它 —— 见 `rawValueAtRuntimeCoord`。 */
  readonly refLookupRaw?: (a1: string) => Value
}

export function spillRunOf(ctx: EvalContext): SpillProjectionRun | undefined {
  return (ctx as SpillAwareContext).spillProjection
}
