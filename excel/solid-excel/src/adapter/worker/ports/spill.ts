// 一句话：溢出区查询端口。

import type { SpillRegionRequest, SpillRegionResult } from '@einfach/spreadsheet-ui-core'
import { toA1 } from '@einfach/spreadsheet-ui-core'
import { resolveSheet } from '../sheet-ops'
import type { WorkerWorkbookSpreadsheetBackend } from '../types'
import type { WorkerBackendState } from '../state'

export function createSpillPorts(
  state: WorkerBackendState,
): Pick<WorkerWorkbookSpreadsheetBackend, 'readSpillRegion'> {
  return {
    /**
     * ADR 0006 阶段 3 —— 溢出区查询。装饰性只读：不 bump revision、不记 undo。
     *
     * 两个 runtime 都实现（WASM 走 `spillAnchor`/`spillInfo` 导出，TS runtime 走
     * 反向扫描），所以这里不做能力门控。查询坐标越界或不在任何活动数组里都回
     * `region: null` —— 与端口缺席是两回事，后者由 UI-core 的能力证据处理。
     *
     * `blockedBy`（碰撞态 `#SPILL!` 锚点要清哪一格）与随它同行的 `blockedByArray`
     * （那一格是不是一个数组）只有 WASM runtime 给得出，TS 参考引擎没有溢出索引、
     * 答不出，于是那边恒缺席。两侧差异见 `worker-protocol.ts` 的 `SpillRegionWire`。
     *
     * `anchorFormula`（锚点公式原文，公式栏在投影格上显示的那条）则**两侧都给得
     * 出** —— 锚点在两个引擎里都有自己的条目。别把它跟 `blockedBy` 归成一类。
     */
    async readSpillRegion(request: SpillRegionRequest): Promise<SpillRegionResult> {
      const sheet = await resolveSheet(state, request.sheetId)
      const empty: SpillRegionResult = {
        kind: 'spill-region',
        sheetId: request.sheetId,
        region: null,
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
      }
      if (!Number.isInteger(request.row) || !Number.isInteger(request.col)) return empty
      if (request.row < 0 || request.col < 0) return empty

      const wire = await state.client.spillRegion(sheet.idx, toA1(request.row, request.col))
      if (!wire) return empty
      // 碰撞态锚点：有阻塞线索，但没有矩形可画 —— 它一个格子都没装上。
      // `blockedByArray` 只在为真时上抛，缺席 = 「不是数组 / 答不出」，UI 说朴素那句。
      if (wire.blockedBy) {
        return {
          ...empty,
          blockedBy: { ...wire.blockedBy },
          ...(wire.blockedByArray === true ? { blockedByArray: true } : {}),
        }
      }
      if (!Number.isInteger(wire.rows) || !Number.isInteger(wire.cols)) return empty
      const rows = wire.rows as number
      const cols = wire.cols as number
      return {
        ...empty,
        region: {
          anchor: { row: wire.anchorRow, col: wire.anchorCol },
          range: {
            rowStart: wire.anchorRow,
            rowEnd: wire.anchorRow + rows - 1,
            colStart: wire.anchorCol,
            colEnd: wire.anchorCol + cols - 1,
          },
        },
        // 锚点公式：公式栏在投影格上显示的就是它。缺席就缺席，UI 会退回原行为。
        ...(wire.anchorFormula === undefined ? {} : { anchorFormula: wire.anchorFormula }),
      }
    },
  }
}
