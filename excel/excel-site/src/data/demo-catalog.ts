export type DemoRuntime = 'worker-wasm' | 'static'

export interface DemoDefinition {
  id: string
  runtime: DemoRuntime
  scenario: 'performance' | 'formula-engine' | 'clean-messy-data' | 'hand-off-form' | 'collaboration' | 'roster'
  sourceFiles: readonly string[]
}

/**
 * Defines the demo routes and the one exceptional static-backend scenario.
 */
export const demos: readonly DemoDefinition[] = [
  {
    id: 'viewport-projection',
    runtime: 'worker-wasm',
    scenario: 'performance',
    sourceFiles: ['excel/excel-site/src/islands/DemoIsland.tsx', 'excel/excel-site/src/demos/seeds/seed-performance.ts'],
  },
  {
    id: 'lazy-formulas',
    runtime: 'worker-wasm',
    scenario: 'performance',
    sourceFiles: ['excel/excel-site/src/islands/DemoIsland.tsx', 'excel/excel-core-ts/src/eval/runtime-ref.ts'],
  },
  {
    id: 'lazy-area',
    runtime: 'worker-wasm',
    scenario: 'performance',
    sourceFiles: ['excel/excel-site/src/islands/DemoIsland.tsx', 'excel/spreadsheet-ui-core/src/backend/types.ts'],
  },
  {
    id: 'formula-engine',
    runtime: 'worker-wasm',
    scenario: 'formula-engine',
    sourceFiles: ['excel/excel-site/src/islands/DemoIsland.tsx', 'excel/excel-site/src/demos/seeds/seed-formula-engine.ts'],
  },
  {
    id: 'custom-formulas',
    runtime: 'worker-wasm',
    scenario: 'performance',
    sourceFiles: [
      'excel/excel-site/src/islands/custom-formulas/CustomFormulaRegistrations.tsx',
      'excel/excel-site/src/demos/seeds/seed-custom-formulas.ts',
      'excel/rust/excel-core/src/CUSTOM_FORMULAS.md',
    ],
  },
  {
    id: 'clean-messy-data',
    runtime: 'static',
    scenario: 'clean-messy-data',
    sourceFiles: ['excel/excel-site/src/islands/DemoIsland.tsx', 'excel/excel-site/src/demos/seeds/seed-clean-messy-data.ts'],
  },
  {
    id: 'hand-off-a-form',
    runtime: 'static',
    scenario: 'hand-off-form',
    sourceFiles: ['excel/excel-site/src/islands/DemoIsland.tsx', 'excel/excel-site/src/demos/seeds/seed-hand-off-form.ts'],
  },
  {
    id: 'bring-your-own-backend',
    runtime: 'static',
    scenario: 'roster',
    sourceFiles: ['excel/excel-site/src/islands/DemoIsland.tsx', 'excel/excel-site/src/demos/seeds/seed-basics.ts'],
  },
  {
    id: 'collaboration',
    runtime: 'static',
    scenario: 'collaboration',
    sourceFiles: ['excel/excel-site/src/islands/DemoIsland.tsx', 'excel/excel-site/src/demos/seeds/seed-collaboration.ts'],
  },
  {
    id: 'workbench',
    runtime: 'worker-wasm',
    scenario: 'performance',
    sourceFiles: ['excel/excel-site/src/islands/DemoIsland.tsx', 'excel/excel-site/src/demos/seeds/seed-performance.ts'],
  },
]

export function findDemo(id: string): DemoDefinition {
  const demo = demos.find((candidate) => candidate.id === id)
  if (!demo) throw new Error('Unknown demo: ' + id)
  return demo
}
