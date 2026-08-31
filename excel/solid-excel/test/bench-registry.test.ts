import { describe, expect, it, jest } from '@jest/globals'

import { getBenchScenario, listBenchScenarios } from '../bench/registry'

jest.mock('../bench/fixture', () => ({
  BENCH_SHEET_ID: 'bench-sheet',
  mountBenchFixture: jest.fn(),
}))

const PUBLIC_SCENARIOS = [
  { id: 'scroll-large', category: 'scroll', dataScaleId: 'large' },
  { id: 'recalc-chain-large', category: 'recalc', dataScaleId: 'large' },
  { id: 'first-screen-smoke', category: 'first-screen', dataScaleId: 'smoke' },
] as const

describe('benchmark registry public contract', () => {
  it('lists the supported scenarios under stable public identifiers', () => {
    const scenarios = listBenchScenarios()

    expect(
      scenarios.map(({ id, category, dataScaleId }) => ({ id, category, dataScaleId })),
    ).toEqual(PUBLIC_SCENARIOS)
    for (const scenario of scenarios) {
      expect(scenario).toEqual(
        expect.objectContaining({
          title: expect.stringMatching(/\S/),
          methodologyRef: expect.stringContaining('docs/decisions/0009'),
          scenarioRevision: expect.stringMatching(/^v\d+$/),
          definition: expect.stringMatching(/\S/),
          cacheState: expect.stringMatching(/\S/),
          run: expect.any(Function),
        }),
      )
    }
  })

  it('resolves every listed scenario by id and rejects unknown ids', () => {
    const scenarios = listBenchScenarios()

    for (const scenario of scenarios) {
      expect(getBenchScenario(scenario.id)).toBe(scenario)
    }
    expect(getBenchScenario('not-a-benchmark-scenario')).toBeUndefined()
  })
})
