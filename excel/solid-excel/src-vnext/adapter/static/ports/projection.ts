// 一句话：投影读取端口。

import type { RangeProjectionResult, VisibleProjectionResult } from '@einfach/spreadsheet-ui-core'
import type { StaticSpreadsheetBackend } from '../backend-contract'
import { buildProjectionResult } from '../projection'
import type { StaticBackendState } from '../state'
import { buildViewportSizeProjectionResult } from '../viewport-size'

export function createProjectionPorts(
  state: StaticBackendState,
): Pick<
  StaticSpreadsheetBackend,
  'readVisibleProjection' | 'readRangeProjection' | 'readViewportSizeProjection'
> {
  return {
    // 刻意**不**实现 `readSpillRegion`（ADR 0006 阶段 3）：静态引擎根本没有动态数组
    // 模型（同 §5.1 的排序闸门注释），装一个恒回 null 的实现等于谎称「这里确实没有
    // 数组」。省掉端口后 `spillRegionSupportedAtom` 转 false，溢出边框与投影格标记
    // 整体不出现 —— 这就是可选端口的降级契约。
    async readVisibleProjection(request) {
      return buildProjectionResult(request, state) as VisibleProjectionResult
    },
    async readRangeProjection(request) {
      return buildProjectionResult(request, state) as RangeProjectionResult
    },
    async readViewportSizeProjection(request) {
      return buildViewportSizeProjectionResult(request, state)
    },
  }
}
