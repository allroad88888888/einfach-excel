// 一句话：执行一个已登记场景并组装成 AD-510 结果 JSON（输出 + 环境记录 + 非承诺声明）。

import { collectEnvironmentRecord } from './environment'
import { MEASURED_RUNS, WARMUP_RUNS } from './stats'
import { BENCH_DATA_DEFINITION } from './tier-data'
import type { BenchRunContext, BenchScenario, BenchScenarioResult } from './types'

/** ADR 0010：随每份结果一起导出的非承诺边界声明。 */
export const NON_GUARANTEE_STATEMENT =
  '本结果是一次具名运行的观测证据，不是产品承诺：它不构成任何环境下的最低性能、' +
  'SLO/SLA、回归门槛，不预测未测场景或未来版本，也不支持与其他产品比较。' +
  '适用边界见 docs/decisions/0010-public-performance-non-guarantees.md。'

export async function runBenchScenario(
  scenario: BenchScenario,
  context: BenchRunContext,
): Promise<BenchScenarioResult> {
  const output = await scenario.run(context)
  context.onProgress?.('collecting environment record…')
  const environment = await collectEnvironmentRecord({
    scenario,
    dataDefinition: BENCH_DATA_DEFINITION,
    cacheState: scenario.cacheState,
  })
  return {
    schema: 'einfach.benchmark-result/v1',
    scenarioId: scenario.id,
    title: scenario.title,
    category: scenario.category,
    methodologyRef: scenario.methodologyRef,
    definition: scenario.definition,
    protocol: { warmupRuns: WARMUP_RUNS, measuredRuns: MEASURED_RUNS },
    output,
    environment,
    nonGuarantee: NON_GUARANTEE_STATEMENT,
  }
}
