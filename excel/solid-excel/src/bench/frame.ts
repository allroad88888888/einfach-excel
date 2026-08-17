// 一句话：基准场景共用的 rAF 等待与单元格文本轮询工具。

/** 下一帧；resolve 值为 rAF 回调的时间戳（与 performance.now() 同一时基）。 */
export function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

export async function waitFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) await nextFrame()
}

export interface WaitForCellTextResult {
  /** 命中时那一帧的 rAF 时间戳。 */
  observedAt: number
}

/**
 * 网格滚动容器是"锚点 + 有界表面"（表面高度约为视口 5 倍，见
 * grid-projection-controller 的 reanchor）：DOM scrollTop 只是表面内的物理位移，
 * 一次性写入大偏移会被 clamp。要跨大距离滚动只能逐帧把物理位移压到边缘，
 * 让重锚机制搬运逻辑位置 —— 完成与否以目标行是否渲染出来为准。
 */
export async function scrollUntilRowRendered(
  root: ParentNode,
  viewport: HTMLElement,
  rowIndex: number,
  direction: 'down' | 'up',
  timeoutMs: number,
): Promise<void> {
  const deadline = performance.now() + timeoutMs
  for (;;) {
    if (root.querySelector(`[data-row="${rowIndex}"][data-cell-addr]`)) {
      if (direction === 'up' && viewport.scrollTop !== 0) {
        viewport.scrollTop = 0
        await nextFrame()
        continue
      }
      return
    }
    viewport.scrollTop = direction === 'down' ? viewport.scrollHeight : 0
    await nextFrame()
    if (performance.now() > deadline) {
      throw new Error(`timed out after ${timeoutMs}ms scrolling ${direction} to row ${rowIndex}`)
    }
  }
}

/**
 * 逐帧轮询，直到 root 下 `[data-cell-addr=<addr>]` 的文本等于 expected。
 * 超时抛错（携带最后一次观测到的文本），供采样协议记录失败原因。
 */
export async function waitForCellText(
  root: ParentNode,
  addr: string,
  expected: string,
  timeoutMs: number,
): Promise<WaitForCellTextResult> {
  const deadline = performance.now() + timeoutMs
  let lastSeen: string | null = null
  for (;;) {
    const timestamp = await nextFrame()
    const cell = root.querySelector(`[data-cell-addr="${addr}"]`)
    lastSeen = cell?.textContent ?? null
    if (lastSeen !== null && lastSeen.trim() === expected) return { observedAt: timestamp }
    if (performance.now() > deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for cell ${addr} to show "${expected}" ` +
          `(last seen: ${lastSeen === null ? '<missing>' : `"${lastSeen.trim()}"`})`,
      )
    }
  }
}
