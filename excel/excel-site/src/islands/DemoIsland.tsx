import { onCleanup } from 'solid-js'
import { useSetAtom } from '@einfach/solid'
import { findDemo } from '../data/demo-catalog'
import { basicsSeed } from '../demos/seeds/seed-basics'
import { cleanMessyDataSeed } from '../demos/seeds/seed-clean-messy-data'
import { collaborationSeed } from '../demos/seeds/seed-collaboration'
import { customFormulaSheets, seedCustomFormulasWorkbook } from '../demos/seeds/seed-custom-formulas'
import { formulaEngineSheets, seedFormulaEngineWorkbook } from '../demos/seeds/seed-formula-engine'
import { handOffFormSeed } from '../demos/seeds/seed-hand-off-form'
import {
  PERFORMANCE_COLS,
  PERFORMANCE_SHEET_ROWS,
  performanceSheets,
  seedPerformanceWorkbook,
} from '../demos/seeds/seed-performance'
import { makeStaticBackend, makeWasmWorkerBackend } from '../spreadsheet/backends'
import DemoGrid from './demo-grid/DemoGrid'
import DemoTour from './demo-tour/DemoTour'
import CustomFormulaRegistrations from './custom-formulas/CustomFormulaRegistrations'
import PerformanceHud from './performance-hud/PerformanceHud'
import { makeMeasuredWasmWorkerBackend } from './performance-hud/measured-worker-backend'
import { createPerformanceMetricsAtom } from './performance-hud/performance-metrics'
import '@einfach/solid-excel/vnext-styles.css'

interface DemoIslandProps {
  demoId: string
  locale: 'en' | 'zh'
}

/**
 * Selects the real backend once for every interactive demo island.
 */
export default function DemoIsland(props: DemoIslandProps) {
  const demo = findDemo(props.demoId)
  const isStaticBackend = demo.runtime === 'static'
  const isPerformanceDemo = demo.id === 'viewport-projection'
  const isCustomFormulaDemo = demo.id === 'custom-formulas'
  const metricsAtom = createPerformanceMetricsAtom(PERFORMANCE_SHEET_ROWS)
  const setMetrics = useSetAtom(metricsAtom)
  const backend = isStaticBackend
    ? makeStaticBackend(staticSeedFor(demo.scenario))
    : isPerformanceDemo
      ? makeMeasuredWasmWorkerBackend({
          sheets: performanceSheets,
          afterInit: seedPerformanceWorkbook,
          setMetrics,
        })
      : makeWasmWorkerBackend({
          ...(isCustomFormulaDemo
            ? { sheets: customFormulaSheets, afterInit: seedCustomFormulasWorkbook }
            : demo.scenario === 'formula-engine'
            ? { sheets: formulaEngineSheets, afterInit: seedFormulaEngineWorkbook }
            : { sheets: performanceSheets, afterInit: seedPerformanceWorkbook }),
        })

  if (!isStaticBackend) onCleanup(() => backend.dispose())

  return (
    <section class="demo-island" data-runtime={demo.runtime}>
      <aside class="demo-runtime-note" aria-label="Demo runtime">
        <strong>{isStaticBackend ? 'In-memory backend' : 'Worker + Rust/WASM'}</strong>
        <span>
          {isStaticBackend
            ? 'This scenario runs against the same backend contract with an intentionally local data host.'
            : 'The workbook engine stays in a Web Worker; the browser only renders the visible projection.'}
        </span>
      </aside>
      {isPerformanceDemo && <PerformanceHud metricsAtom={metricsAtom} />}
      <DemoTour stepCount={3} locale={props.locale} />
      <DemoGrid
        backend={backend}
        rows={isStaticBackend || demo.scenario === 'formula-engine' ? 100 : PERFORMANCE_SHEET_ROWS}
        columns={isStaticBackend || demo.scenario === 'formula-engine' ? 20 : PERFORMANCE_COLS}
      >
        {isCustomFormulaDemo && <CustomFormulaRegistrations />}
      </DemoGrid>
    </section>
  )
}

function staticSeedFor(scenario: string) {
  if (scenario === 'clean-messy-data') return cleanMessyDataSeed
  if (scenario === 'hand-off-form') return handOffFormSeed
  if (scenario === 'collaboration') return collaborationSeed
  return basicsSeed
}
