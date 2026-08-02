import type { WasmWorkbookRuntime } from './wasm-workbook-surface'
import type { WorkerCommandHandler } from './worker-command'
import { postResponse } from './worker-post'
import { assertMethod, assertSheet, normalizeAddr } from './worker-wire-guards'
import type { SpillRegionWire } from './worker-protocol'

/**
 * 动态数组的溢出区查询（ADR 0006 阶段 3）。装饰性只读：不改状态、不 bump revision。
 *
 * 三次绑定调用封顶：先问 `spillAnchor`（`addr` 是投影格时给出锚点），问不到再拿
 * `addr` 自己去问 `spillInfo`（`addr` 就是锚点的情形）。两个都问不到时还剩最后一种
 * 可能 —— `addr` 是**碰撞态**（`#SPILL!`）锚点，它一个格子都没装上，所以前两问必然
 * 空手而回；这时问 `spillBlocker`，把「被谁挡住」带上去。全都问不到才是「不在任何
 * 活动溢出区里，也没什么可解释的」。
 *
 * 第三问放在这里而不是单开一条 RPC：它与前两问是**同一次选区移动**上的同一个问题
 * （「我脚下这一格跟动态数组有什么关系」），拆成两条 RPC 只会让每次选区移动多一个
 * 往返，而 UI 恰恰无法预先知道该不该发第二条。
 *
 * 这里不 import `@einfach/excel-core-ts` —— WASM worker 的包里不该出现 TS 参考引擎，
 * 所以 A1 解析在本文件自带一份（只解析锚点地址这一个用途）。
 */

function parseAnchorAddr(addr: string): { row: number; col: number } | null {
  const match = addr.match(/^([A-Z]+)(\d+)$/)
  if (!match) return null
  let col = 0
  for (let index = 0; index < match[1].length; index += 1) {
    col = col * 26 + (match[1].charCodeAt(index) - 64)
  }
  const row = Number(match[2]) - 1
  if (!Number.isInteger(row) || row < 0) return null
  return { row, col: col - 1 }
}

function shapeOf(
  shape: ArrayLike<number> | null | undefined,
): { rows: number; cols: number } | null {
  if (!shape || shape.length < 2) return null
  const rows = Number(shape[0])
  const cols = Number(shape[1])
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) return null
  return { rows, cols }
}

/**
 * 碰撞态锚点的阻塞地址。**不走 `assertMethod`**：这个导出比另外两个晚落地，旧的
 * wasm-pkg 上它不存在，而为一句提示文案把整条溢出区查询打成
 * `WASM_METHOD_UNAVAILABLE` 是本末倒置 —— 缺席就当「答不出」，边框照画。
 */
function blockerOf(
  wb: WasmWorkbookRuntime,
  sheet: number,
  addr: string,
): { row: number; col: number } | null {
  if (typeof wb.spillBlocker !== 'function') return null
  const blocker = wb.spillBlocker(sheet, addr)
  return typeof blocker === 'string' ? parseAnchorAddr(blocker) : null
}

export const handleSpillCommand: WorkerCommandHandler = (id, msg, wb) => {
  if (msg.cmd !== 'spillRegion') return false

  const sheet = Number(msg.sheet)
  assertSheet(wb, sheet)
  const addr = normalizeAddr(msg.addr)
  const spillAnchor = assertMethod(wb, 'spillAnchor')
  const spillInfo = assertMethod(wb, 'spillInfo')

  const anchorAddr = spillAnchor.call(wb, sheet, addr) ?? addr
  const shape = shapeOf(spillInfo.call(wb, sheet, anchorAddr))
  const anchor = shape === null ? null : parseAnchorAddr(anchorAddr)
  if (shape === null || anchor === null) {
    // 没有活动溢出区。剩下唯一值得说的是「你脚下这一格是个被挡住的锚点」——
    // 问的是 `addr` 自己而不是 `anchorAddr`：碰撞态锚点没有投影格，所以
    // `spillAnchor` 那一问必然回 null，两者本就相等，用 `addr` 更说得清意图。
    const blockedBy = blockerOf(wb, sheet, addr)
    const self = blockedBy === null ? null : parseAnchorAddr(addr)
    postResponse(
      id,
      blockedBy === null || self === null
        ? null
        : ({
            sheet,
            anchorRow: self.row,
            anchorCol: self.col,
            blockedBy,
          } satisfies SpillRegionWire),
    )
    return true
  }

  postResponse(id, {
    sheet,
    anchorRow: anchor.row,
    anchorCol: anchor.col,
    rows: shape.rows,
    cols: shape.cols,
  } satisfies SpillRegionWire)
  return true
}
