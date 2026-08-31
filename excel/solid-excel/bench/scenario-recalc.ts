// 一句话：AD-507 公式链重算基准 —— large 档 10,000 行依赖链，单格改写到链尾 UI 收敛的耗时。

import { BENCH_SHEET_ID, mountBenchFixture } from './fixture'
import { scrollUntilRowRendered, waitForCellText } from './frame'
import { runSamplingProtocol } from './stats'
import { BENCH_TIERS } from './tier-data'
import type { BenchScenario, BenchScenarioOutput } from './types'

const CHAIN_ROWS = BENCH_TIERS.large.formulaChainRows
const TAIL_ADDR = `A${CHAIN_ROWS}`
/** 每次写入的基准值；随样本递增保证"有效新值"（ADR 0009 §公式链重算延迟）。 */
const INPUT_BASE = 1000
const CONVERGE_TIMEOUT_MS = 30_000
/** 逐帧搬运 24 万逻辑 px 到链尾的预算（锚点表面下每帧只前进不足一个表面高）。 */
const POSITION_TIMEOUT_MS = 90_000

async function run(context: Parameters<BenchScenario['run']>[0]): Promise<BenchScenarioOutput> {
  context.onProgress?.(`mounting large-tier formula chain (${CHAIN_ROWS} rows)…`)
  const fixture = await mountBenchFixture({
    container: context.stage,
    tier: 'large',
    shape: 'formula-chain',
  })
  try {
    // 链尾必须在视口内，DOM 收敛才是可观察的完成条件：滚到底并等初值 10000 上屏。
    // 滚动容器是锚点 + 有界表面，只能逐帧搬运（见 scrollUntilRowRendered）。
    await scrollUntilRowRendered(
      fixture.root,
      fixture.scrollViewport,
      CHAIN_ROWS - 1,
      'down',
      POSITION_TIMEOUT_MS,
    )
    await waitForCellText(fixture.root, TAIL_ADDR, String(CHAIN_ROWS), CONVERGE_TIMEOUT_MS)

    let writeCounter = 0
    const primary = await runSamplingProtocol({
      sampleMeaning:
        'ms from issuing the A1 write until the visible chain tail cell renders the matching value',
      unit: 'ms',
      onProgress: (message) => context.onProgress?.(`recalc ${message}`),
      runSample: async () => {
        writeCounter += 1
        const inputValue = INPUT_BASE + writeCounter
        const expectedTail = String(inputValue + CHAIN_ROWS - 1)
        const startedAt = performance.now()
        // 与编辑提交同一条协议：写 ACK 后重读可见窗口投影（WASM runtime 不对
        // 普通写入广播 cellsDirty），再等链尾 DOM 呈现匹配值。
        await fixture.backend.setCellInput({
          kind: 'set-cell-input',
          sheetId: BENCH_SHEET_ID,
          row: 0,
          col: 0,
          input: String(inputValue),
        })
        await fixture.refreshProjection()
        const converged = await waitForCellText(
          fixture.root,
          TAIL_ADDR,
          expectedTail,
          CONVERGE_TIMEOUT_MS,
        )
        return converged.observedAt - startedAt
      },
    })

    return {
      primary,
      detail: {
        chainRows: CHAIN_ROWS,
        inputCell: 'A1',
        targetCell: TAIL_ADDR,
        completion:
          `target cell ${TAIL_ADDR} DOM text equals <input> + ${CHAIN_ROWS - 1}, ` +
          'checked once per rAF frame',
      },
    }
  } finally {
    fixture.dispose()
  }
}

export const recalcScenario: BenchScenario = {
  id: 'recalc-chain-large',
  title: '公式链重算延迟（large 档 10,000 行链）',
  category: 'recalc',
  methodologyRef: 'ADR 0009 §公式链重算延迟 (docs/decisions/0009)',
  scenarioRevision: 'v1',
  dataScaleId: 'large',
  definition:
    `AD-509 large 档公式链（A1=1，A2=A1+1 … A${CHAIN_ROWS}）灌入 worker/WASM 工作簿；` +
    `视口滚到链尾使 ${TAIL_ADDR} 可见。一次样本 = 向 A1 写入一个未用过的新数值起，` +
    '经编辑提交同款协议（写 ACK 后重读可见窗口投影，engine 在读取时惰性重算链），' +
    `到 ${TAIL_ADDR} 的 DOM 文本呈现"新值+${CHAIN_ROWS - 1}"止（逐 rAF 帧判定），` +
    '计时含 worker 重算与 UI 可观察更新，不含样本间等待。',
  cacheState: 'warm (fixture mounted and chain tail visible before sampling, single page session)',
  run,
}
