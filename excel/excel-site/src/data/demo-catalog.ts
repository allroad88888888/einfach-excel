export type DemoRuntime = 'worker-wasm' | 'static'

export interface DemoDefinition {
  id: string
  runtime: DemoRuntime
  scenario:
    | 'performance'
    | 'demand-driven'
    | 'formula-engine'
    | 'clean-messy-data'
    | 'hand-off-form'
    | 'collaboration'
    | 'roster'
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
    sourceFiles: [
      'excel/excel-site/src/islands/DemoIsland.tsx',
      'excel/excel-site/src/demos/seeds/seed-performance.ts',
    ],
  },
  {
    id: 'lazy-formulas',
    runtime: 'worker-wasm',
    scenario: 'demand-driven',
    sourceFiles: [
      'excel/excel-site/src/islands/DemoIsland.tsx',
      'excel/excel-site/src/demos/seeds/seed-demand-driven.ts',
      'excel/rust/excel-core/src/workbook_eval_provider.rs',
    ],
  },
  {
    id: 'lazy-area',
    runtime: 'worker-wasm',
    scenario: 'performance',
    sourceFiles: [
      'excel/excel-site/src/islands/DemoIsland.tsx',
      'excel/spreadsheet-ui-core/src/backend/types.ts',
    ],
  },
  {
    id: 'formula-engine',
    runtime: 'worker-wasm',
    scenario: 'formula-engine',
    sourceFiles: [
      'excel/excel-site/src/islands/DemoIsland.tsx',
      'excel/excel-site/src/demos/seeds/seed-formula-engine.ts',
    ],
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
    sourceFiles: [
      'excel/excel-site/src/islands/DemoIsland.tsx',
      'excel/excel-site/src/demos/seeds/seed-clean-messy-data.ts',
    ],
  },
  {
    id: 'hand-off-a-form',
    runtime: 'static',
    scenario: 'hand-off-form',
    sourceFiles: [
      'excel/excel-site/src/islands/DemoIsland.tsx',
      'excel/excel-site/src/demos/seeds/seed-hand-off-form.ts',
    ],
  },
  {
    id: 'bring-your-own-backend',
    runtime: 'static',
    scenario: 'roster',
    sourceFiles: [
      'excel/excel-site/src/islands/DemoIsland.tsx',
      'excel/excel-site/src/demos/seeds/seed-basics.ts',
    ],
  },
  {
    id: 'react-controlled-projection',
    runtime: 'static',
    scenario: 'roster',
    sourceFiles: [
      'excel/excel-site/src/islands/ReactAdapterDemoIsland.tsx',
      'excel/react-excel/src/index.ts',
      'excel/react-excel/src/use-spreadsheet-pointer-selection.ts',
    ],
  },
  {
    id: 'vue-controlled-projection',
    runtime: 'static',
    scenario: 'roster',
    sourceFiles: [
      'excel/excel-site/src/islands/VueAdapterDemoIsland.vue',
      'excel/excel-site/src/islands/VueAdapterDemoGrid.vue',
      'excel/vue-excel/src/index.ts',
      'excel/vue-excel/src/use-spreadsheet-pointer-selection.ts',
    ],
  },
  {
    id: 'collaboration',
    runtime: 'static',
    scenario: 'collaboration',
    sourceFiles: [
      'excel/excel-site/src/islands/DemoIsland.tsx',
      'excel/excel-site/src/demos/seeds/seed-collaboration.ts',
    ],
  },
  {
    id: 'workbench',
    runtime: 'worker-wasm',
    // formula-engine 而非 performance:workbench 的文案卖点是"完整外壳组合"
    // (toolbar/多 sheet 页签/状态栏),3 sheet + 跨表公式的小 seed 秒级加载,
    // 也比单 sheet 大数据集更贴题;10 万行的规模展示归 viewport-projection。
    scenario: 'formula-engine',
    sourceFiles: [
      'excel/excel-site/src/islands/DemoIsland.tsx',
      'excel/excel-site/src/demos/seeds/seed-formula-engine.ts',
    ],
  },
]

export function findDemo(id: string): DemoDefinition {
  const demo = demos.find((candidate) => candidate.id === id)
  if (!demo) throw new Error('Unknown demo: ' + id)
  return demo
}
