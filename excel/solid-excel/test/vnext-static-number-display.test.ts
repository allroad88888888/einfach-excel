import { describe, expect, it } from '@jest/globals'
import {
  createRangeProjectionRequest,
  type CellRange,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { createStaticSpreadsheetBackend } from '../src-vnext/adapter'

/**
 * 静态参考后端里，一个数字字面量有**两条通道**，这个文件只管这一件事：
 *
 * - `displayValue` —— 按 Excel 的 General 规格渲染（15 位有效数字）。它和
 *   worker runtime 的 `valueDisplay`、Rust 的 `format::default_number_string`
 *   共用同一份规格，因为 `vnext-worker-paste-special.test.ts` 的 `expectParity`
 *   拿两个后端的显示逐格比。
 * - `numericValue` —— 原始双精度，一位不折。求和、排序、筛选、填充序列读的都是
 *   它（`readCanonicalFillSeriesValue` 优先取 `numericValue`，取不到才回退去
 *   **解析显示串**）。
 *
 * 两条通道必须同时对。只把显示改成 General 而不落 `numericValue`，回退分支就会
 * 去解析已经收过位的显示串，把 15 位当成原始值 —— 显示修好了，精度悄悄丢了。
 */

const SHEET_ID = 'sheet-1'
let nextRequestId = 700

async function readRange(backend: SpreadsheetBackend, range: CellRange) {
  return backend.readRangeProjection(
    createRangeProjectionRequest({
      sheetId: SHEET_ID,
      requestId: nextRequestId++,
      reason: 'test',
      range,
    }),
  )
}

const ONE_CELL: CellRange = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }

async function writeAndRead(input: string) {
  const backend = createStaticSpreadsheetBackend({ revision: 1 })
  await backend.setCellInput({
    kind: 'set-cell-input',
    sheetId: SHEET_ID,
    row: 0,
    col: 0,
    input,
  })
  return (await readRange(backend, ONE_CELL)).cells[0]
}

describe('static backend — 数字字面量的显示与精度是两条通道', () => {
  it.each([
    // 17 位有效数字的输入 —— Paste Special 的除法就是这么落地的（10/6）。
    { input: '1.6666666666666667', display: '1.66666666666667' },
    // 24f6e4d 从 POI 实测表抄进来的观测行：`(0.1+0.2)&""` 是 `0.3`。
    { input: '0.30000000000000004', display: '0.3' },
    // 微软文档的「超过 15 位，后面的数字变成零」。
    { input: '1000000000000001', display: '1000000000000000' },
    // 十进制指数 15 ≤ 19，不转科学计数；JS 的 `String()` 这里会给 `1e+21`。
    { input: '1e21', display: '1E+21' },
    // 尾随零先剪 —— 输入不是原样回显。
    { input: '1.50', display: '1.5' },
  ])('把 $input 按 Excel General 显示成 $display', async ({ input, display }) => {
    const cell = await writeAndRead(input)
    expect(cell?.valueKind).toBe('number')
    expect(cell?.displayValue).toBe(display)
  })

  it.each([
    { input: '1.6666666666666667', raw: 1.6666666666666667 },
    { input: '0.30000000000000004', raw: 0.30000000000000004 },
    { input: '1000000000000001', raw: 1_000_000_000_000_001 },
  ])('把 $input 的原始双精度原封不动留在 numericValue', async ({ input, raw }) => {
    const cell = await writeAndRead(input)
    // 这一行才是「精度没丢」的判据。显示收到 15 位，值不收。
    expect(cell?.numericValue).toBe(raw)
    // 反过来钉死：不能拿显示串反推原始值 —— 那正是回退分支的陷阱。
    expect(cell?.numericValue).not.toBe(Number(cell?.displayValue))
  })
})
