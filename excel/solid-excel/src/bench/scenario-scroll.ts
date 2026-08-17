// 一句话：AD-506 大表滚动基准 —— large 档网格上脚本驱动的连续滚动，逐帧间隔采样。

import { mountBenchFixture, type BenchFixture } from './fixture'
import { nextFrame, scrollUntilRowRendered, waitFrames } from './frame'
import { computeStats, runSamplingProtocol } from './stats'
import type { BenchScenario, BenchScenarioOutput } from './types'

/** 60fps 目标帧预算（ADR 0009 §大表滚动流畅度的"目标帧预算"）。 */
const FRAME_BUDGET_MS = 1000 / 60
/** 每帧滚动步长（CSS px）与步数：一次样本共滚 300 × 32 = 9600px ≈ 400 行。 */
const SCROLL_STEP_PX = 32
const SCROLL_STEPS = 300
/** 终点完成条件：9600 逻辑 px ÷ 24px 行高 = 顶行 400，窗口必须已渲染到该行。 */
const TARGET_ROW = 400
/** 起点/终点前后的未计时稳定帧数。 */
const SETTLE_FRAMES = 3
const RESET_TIMEOUT_MS = 30_000

interface ScrollPassDetail {
  phase: 'warmup' | 'measure'
  sampleIndex: number
  framesTotal: number
  framesWithinBudget: number
  medianFrameMs: number
  p95FrameMs: number
  frameIntervalsMs: number[]
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

async function runScrollPass(fixture: BenchFixture): Promise<number[]> {
  const viewport = fixture.scrollViewport
  // 起点：回到逻辑顶部（锚点表面下只能逐帧搬运，见 scrollUntilRowRendered 注释）。
  await scrollUntilRowRendered(fixture.root, viewport, 0, 'up', RESET_TIMEOUT_MS)
  await waitFrames(SETTLE_FRAMES)
  if (viewport.scrollTop !== 0) throw new Error('scroll pass could not reset to the start position')

  const intervals: number[] = []
  let previous = await nextFrame()
  for (let step = 1; step <= SCROLL_STEPS; step += 1) {
    // 相对步进：物理 scrollTop 会被重锚机制重排，只有逐帧 +32px 能连续推进逻辑位置。
    viewport.scrollTop += SCROLL_STEP_PX
    const timestamp = await nextFrame()
    intervals.push(timestamp - previous)
    previous = timestamp
  }
  await waitFrames(SETTLE_FRAMES)
  if (!fixture.root.querySelector(`[data-row="${TARGET_ROW}"][data-cell-addr]`)) {
    throw new Error(
      `scroll pass ended without rendering the target row ${TARGET_ROW} (completion condition)`,
    )
  }
  return intervals
}

async function run(context: Parameters<BenchScenario['run']>[0]): Promise<BenchScenarioOutput> {
  context.onProgress?.('mounting large-tier grid fixture (1,000,000 cells)…')
  const fixture = await mountBenchFixture({
    container: context.stage,
    tier: 'large',
    shape: 'grid',
  })
  try {
    const passes: ScrollPassDetail[] = []
    const primary = await runSamplingProtocol({
      sampleMeaning:
        'fraction of frame intervals within the 16.67ms frame budget during one scripted pass',
      unit: 'ratio',
      roundTo: 4,
      onProgress: (message) => context.onProgress?.(`scroll ${message}`),
      runSample: async (phase, sampleIndex) => {
        const intervals = await runScrollPass(fixture)
        const withinBudget = intervals.filter((ms) => ms <= FRAME_BUDGET_MS).length
        passes.push({
          phase,
          sampleIndex,
          framesTotal: intervals.length,
          framesWithinBudget: withinBudget,
          medianFrameMs: round2(computeStats(intervals).median),
          p95FrameMs: round2(computeStats(intervals).p95),
          frameIntervalsMs: intervals.map(round2),
        })
        return withinBudget / intervals.length
      },
    })

    const measuredIntervals = passes
      .filter((pass) => pass.phase === 'measure')
      .flatMap((pass) => pass.frameIntervalsMs)
    const pooled = computeStats(measuredIntervals)

    return {
      primary,
      detail: {
        frameBudgetMs: round2(FRAME_BUDGET_MS),
        scrollStepPx: SCROLL_STEP_PX,
        scrollSteps: SCROLL_STEPS,
        scrollDistancePx: SCROLL_STEP_PX * SCROLL_STEPS,
        viewportCssPx: {
          width: fixture.viewport.viewportWidth,
          height: fixture.viewport.viewportHeight,
        },
        pooledMeasuredFrames: {
          count: measuredIntervals.length,
          medianMs: round2(pooled.median),
          p95Ms: round2(pooled.p95),
        },
        passes,
      },
    }
  } finally {
    fixture.dispose()
  }
}

export const scrollScenario: BenchScenario = {
  id: 'scroll-large',
  title: '大表滚动流畅度（large 档 10,000×100）',
  category: 'scroll',
  methodologyRef: 'ADR 0009 §大表滚动流畅度 (docs/decisions/0009)',
  scenarioRevision: 'v1',
  dataScaleId: 'large',
  definition:
    'AD-509 large 档网格（10,000×100，1,000,000 非空单元格）灌入 worker/WASM 工作簿；' +
    '视口 960×480 CSS px，行高 24px。一次样本 = 从逻辑顶部（第 0 行已渲染、物理位移 0）起，' +
    '每 rAF 帧对滚动容器 +32px 相对步进、连续 300 帧（合计 9600 逻辑 px ≈ 400 行），' +
    '再稳定 3 帧且第 400 行的单元格已渲染即为终点；' +
    '采集样本内逐帧间隔，样本值 = 落在 16.67ms 帧预算内的帧比例。',
  cacheState: 'warm (fixture mounted and first paint completed before sampling, single page session)',
  run,
}
