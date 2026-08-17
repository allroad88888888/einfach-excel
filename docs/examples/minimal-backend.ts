// 一句话：只实现 SpreadsheetBackend 三个必需方法的最小内存后端（AD-216 教程示例）。
//
// 契约出处：excel/spreadsheet-ui-core/src/backend/types.ts —— `SpreadsheetBackend`
// 接口里只有 readVisibleProjection / readRangeProjection / setCellInput 三个成员
// 不带 `?`，其余全部可选。本文件的类型标注（返回类型写成 SpreadsheetBackend）
// 就是"三方法即完整实现"的编译期证明：tsc --noEmit 通过 = 契约满足。
//
// 刻意不做的事（诚实边界）：
// - 没有公式引擎：`=SUM(A1:A2)` 会按普通文本存储与显示，不求值。装一个假引擎
//   比没有引擎更糟——静态参考实现对 readSpillRegion 的注释说得很清楚：
//   "装一个恒回 null 的实现等于谎称"（adapter/static/ports/projection.ts）。
// - 没有 undo/redo 端口：宿主侧 recordHistoryEntry 会因此不记 history 条目，
//   Ctrl+Z 永远处于"无可撤销"状态——这是契约内的正确降级，不是 bug。
// - 没有 listSheets：UI 只操作调用方传入请求里的 sheetId，各 sheet 惰性创建。

import type {
  BackendMutationResult,
  CellRange,
  DisplayCell,
  RangeProjectionRequest,
  RangeProjectionResult,
  SetCellInputRequest,
  SpreadsheetBackend,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'

export interface MinimalSeedCell {
  row: number
  col: number
  input: string
}

export interface MinimalBackendSeed {
  sheetId: string
  cells: readonly MinimalSeedCell[]
}

/** 每格只存原始输入串；显示值在投影时派生，不落第二份状态。 */
type SheetCells = Map<string, string>

function keyFor(row: number, col: number): string {
  return `${row}:${col}`
}

/**
 * 最小的显示派生：能整体解析为有限数的输入按 number 投影（并带上
 * `numericValue`，见 DisplayCell 注释"the canonical finite number before
 * display formatting"），其余一律按 string。没有布尔/错误/日期推断。
 */
function toDisplayCell(row: number, col: number, input: string): DisplayCell {
  const trimmed = input.trim()
  if (trimmed !== '') {
    const numeric = Number(trimmed)
    if (Number.isFinite(numeric)) {
      return { row, col, displayValue: trimmed, valueKind: 'number', numericValue: numeric }
    }
  }
  return { row, col, displayValue: input, valueKind: 'string' }
}

function copyRange(range: CellRange): CellRange {
  return {
    rowStart: range.rowStart,
    rowEnd: range.rowEnd,
    colStart: range.colStart,
    colEnd: range.colEnd,
  }
}

/** 边界含义与 projection/index.ts 的 isCellInRange 一致：闭区间。 */
function isInside(row: number, col: number, range: CellRange): boolean {
  return (
    row >= range.rowStart && row <= range.rowEnd && col >= range.colStart && col <= range.colEnd
  )
}

export function createMinimalSpreadsheetBackend(seed?: MinimalBackendSeed): SpreadsheetBackend {
  const sheets = new Map<string, SheetCells>()
  // 内容版本号：每次成功写入 +1。投影契约（docs/PROJECTION_BOUNDARY_CONTRACT.md、
  // projection/index.ts 的 projectionRevisionsCorrelate）要求：请求未带 revision
  // 时由后端报出当前版本；请求显式带了 revision 时必须原样回显，否则结果按
  // STALE_RESULT 拒收。静态参考实现的 `request.revision ?? state.revision`
  // 就是这两条的合并写法，这里照抄同一语义。
  let revision = 0

  if (seed !== undefined) {
    const cells: SheetCells = new Map()
    for (const cell of seed.cells) {
      cells.set(keyFor(cell.row, cell.col), cell.input)
    }
    sheets.set(seed.sheetId, cells)
  }

  function sheetFor(sheetId: string): SheetCells {
    let cells = sheets.get(sheetId)
    if (cells === undefined) {
      cells = new Map()
      sheets.set(sheetId, cells)
    }
    return cells
  }

  /**
   * 采集矩形内的格子，行主序排序。契约（projection/index.ts 的
   * validateProjectionResult）：结果格必须都落在请求矩形内（CELL_OUT_OF_RANGE），
   * 数量不得超过矩形容量（RESULT_TOO_LARGE）；不要求矩形被填满——空白格
   * 不投影就是空白。
   */
  function collectCells(sheetId: string, range: CellRange): DisplayCell[] {
    const out: DisplayCell[] = []
    for (const [key, input] of sheetFor(sheetId)) {
      const sep = key.indexOf(':')
      const row = Number(key.slice(0, sep))
      const col = Number(key.slice(sep + 1))
      if (!isInside(row, col, range)) continue
      out.push(toDisplayCell(row, col, input))
    }
    out.sort((a, b) => (a.row === b.row ? a.col - b.col : a.row - b.row))
    return out
  }

  return {
    // 必需方法 1：可见窗口投影。结果必须回显请求的 kind / sheetId /
    // requestId / 矩形（isProjectionResultForRequest 逐项核对，任何一项
    // 不匹配整个结果按 STALE_RESULT 丢弃）。
    async readVisibleProjection(request: VisibleProjectionRequest): Promise<VisibleProjectionResult> {
      return {
        kind: 'visible-window',
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? revision,
        window: copyRange(request.window),
        cells: collectCells(request.sheetId, request.window),
      }
    },

    // 必需方法 2：显式区域投影。与可见窗口同构，但走 UI core 的独立
    // busy 车道（剪贴板复制、Go To、诊断等命令用它，不用于刷新可见显示）。
    async readRangeProjection(request: RangeProjectionRequest): Promise<RangeProjectionResult> {
      return {
        kind: 'range',
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? revision,
        range: copyRange(request.range),
        cells: collectCells(request.sheetId, request.range),
      }
    },

    // 必需方法 3：提交一格原始输入。契约注释（backend/types.ts）：resolve
    // 成功 ACK = 值真的落地；写不进去必须 reject，绝不能 resolve 一个
    // 成功形状的结果——否则用户键入静默丢失而 UI core 已记账。本实现是
    // 纯内存 Map，写入不会失败，所以永远如实 resolve。空串输入删除该格
    // （回到 blank 投影），与"清空单元格"的直觉一致。
    async setCellInput(request: SetCellInputRequest): Promise<BackendMutationResult> {
      const cells = sheetFor(request.sheetId)
      if (request.input === '') {
        cells.delete(keyFor(request.row, request.col))
      } else {
        cells.set(keyFor(request.row, request.col), request.input)
      }
      revision += 1
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? revision,
        affectedRange: {
          rowStart: request.row,
          rowEnd: request.row,
          colStart: request.col,
          colEnd: request.col,
        },
      }
    },
  }
}
