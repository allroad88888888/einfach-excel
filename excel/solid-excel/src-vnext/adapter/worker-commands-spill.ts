import type { WorkerCommandHandler } from './worker-command'
import { postResponse } from './worker-post'
import { assertMethod, assertSheet, normalizeAddr } from './worker-wire-guards'
import type { SpillRegionWire } from './worker-protocol'

/**
 * 动态数组的溢出区查询（ADR 0006 阶段 3）。装饰性只读：不改状态、不 bump revision。
 *
 * 两次绑定调用封顶：先问 `spillAnchor`（`addr` 是投影格时给出锚点），问不到再拿
 * `addr` 自己去问 `spillInfo`（`addr` 就是锚点的情形）。都问不到就是「不在任何活动
 * 溢出区里」。
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
    postResponse(id, null)
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
