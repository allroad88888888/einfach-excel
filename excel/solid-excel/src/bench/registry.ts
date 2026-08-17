// 一句话：基准场景的唯一登记处（AD-505 契约）—— 新增场景 = 在 SCENARIOS 里加一个条目。

import { firstScreenScenario } from './scenario-first-screen'
import { recalcScenario } from './scenario-recalc'
import { scrollScenario } from './scenario-scroll'
import type { BenchScenario } from './types'

const SCENARIOS: readonly BenchScenario[] = [
  scrollScenario,
  recalcScenario,
  firstScreenScenario,
]

export function listBenchScenarios(): readonly BenchScenario[] {
  return SCENARIOS
}

export function getBenchScenario(id: string): BenchScenario | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id)
}
