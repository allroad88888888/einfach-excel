// 一句话：首屏样本的被测入口页 —— 挂 smoke 档网格，量到首批单元格上屏并把耗时回传父窗口。

import { createSignal, onMount } from 'solid-js'
import { mountBenchFixture } from './fixture'
import {
  FIRST_SCREEN_MESSAGE_TYPE,
  type FirstScreenSampleMessage,
} from './scenario-first-screen'

function postToParent(message: FirstScreenSampleMessage) {
  if (window.parent !== window) window.parent.postMessage(message, '*')
}

/**
 * `/?bench=1&embed=first-screen` 的整页内容。样本区间以本文档自己的
 * performance.timeOrigin（navigation start）为零点，rAF 时间戳即耗时。
 */
export function BenchEmbed() {
  const [status, setStatus] = createSignal('loading grid…')
  let stage: HTMLDivElement | undefined

  onMount(() => {
    void (async () => {
      try {
        if (!stage) throw new Error('embed stage missing')
        const fixture = await mountBenchFixture({
          container: stage,
          tier: 'smoke',
          shape: 'grid',
        })
        const ms = fixture.firstCellRenderedAt
        performance.mark('einfach-bench:first-cells-rendered')
        setStatus(`first cells rendered at ${ms.toFixed(1)}ms`)
        postToParent({ type: FIRST_SCREEN_MESSAGE_TYPE, ms })
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        setStatus(`failed: ${reason}`)
        postToParent({ type: FIRST_SCREEN_MESSAGE_TYPE, ms: -1, error: reason })
      }
    })()
  })

  return (
    <div data-testid="bench-embed">
      <p data-testid="bench-embed-status">{status()}</p>
      <div ref={stage} />
    </div>
  )
}
