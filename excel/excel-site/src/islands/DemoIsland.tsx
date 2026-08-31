import { createSignal, onCleanup } from 'solid-js'
import { useSetAtom } from '@einfach/solid'
import { setLocale } from '@einfach/solid-excel/i18n'
import { findDemo } from '../data/demo-catalog'
import { basicsSeed } from '../demos/seeds/seed-basics'
import { cleanMessyDataSeed } from '../demos/seeds/seed-clean-messy-data'
import { collaborationSeed } from '../demos/seeds/seed-collaboration'
import {
  customFormulaSheets,
  seedCustomFormulasWorkbook,
} from '../demos/seeds/seed-custom-formulas'
import { demandDrivenSheets, seedDemandDrivenWorkbook } from '../demos/seeds/seed-demand-driven'
import { formulaEngineSheets, seedFormulaEngineWorkbook } from '../demos/seeds/seed-formula-engine'
import { handOffFormSeed } from '../demos/seeds/seed-hand-off-form'
import type { WorkerWorkbookBackendSheet, WorkerWorkbookClient } from '@einfach/solid-excel'
import {
  PERFORMANCE_COLS,
  PERFORMANCE_SHEET_ROWS,
  PERFORMANCE_TOTAL_CELLS,
  performanceSheets,
  seedPerformanceWorkbook,
} from '../demos/seeds/seed-performance'
import ImportProgress from './import-progress/ImportProgress'
import { createImportProgressAtom } from './import-progress/import-progress-state'
import { makeStaticBackend, makeWasmWorkerBackend } from '../spreadsheet/backends'
import DemoGrid from './demo-grid/DemoGrid'
import DemoTour from './demo-tour/DemoTour'
import CustomFormulaRegistrations from './custom-formulas/CustomFormulaRegistrations'
import PerformanceHud from './performance-hud/PerformanceHud'
import { makeMeasuredWasmWorkerBackend } from './performance-hud/measured-worker-backend'
import { createPerformanceMetricsAtom } from './performance-hud/performance-metrics'
import '@einfach/spreadsheet-ui-styles/styles.css'

interface DemoIslandProps {
  demoId: string
  locale: 'en' | 'zh'
}

/**
 * Selects the real backend once for every interactive demo island.
 */
export default function DemoIsland(props: DemoIslandProps) {
  // 表格 chrome 的文案 locale 跟随页面 locale。缺了这句,组件库的默认
  // locale(zh)会出现在英文页面上 —— 状态栏"求和/就绪"混进英文站。
  setLocale(props.locale)
  // 表格 chrome 跟随站点主题:镜像 <html data-theme> 到岛根的
  // data-spreadsheet-theme(spreadsheet-ui-styles 的暗色 token 作用域)。
  // client:only 岛,document 在此可用;observer 随组件卸载断开。
  const [siteTheme, setSiteTheme] = createSignal(document.documentElement.dataset.theme)
  const themeObserver = new MutationObserver(() =>
    setSiteTheme(document.documentElement.dataset.theme),
  )
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
  onCleanup(() => themeObserver.disconnect())
  const demo = findDemo(props.demoId)
  const isStaticBackend = demo.runtime === 'static'
  const isPerformanceDemo = demo.id === 'viewport-projection'
  const isCustomFormulaDemo = demo.id === 'custom-formulas'
  const isDemandDrivenDemo = demo.scenario === 'demand-driven'
  // 走 10 万行 performance seed 的 demo(分块导入需要数秒),给可见进度 ——
  // 没有它,格子出现前用户只能看到一句静止的 "Loading workbook…"。
  const usesPerformanceSeed =
    !isStaticBackend &&
    !isCustomFormulaDemo &&
    !isDemandDrivenDemo &&
    demo.scenario !== 'formula-engine'
  const metricsAtom = createPerformanceMetricsAtom(PERFORMANCE_SHEET_ROWS)
  const setMetrics = useSetAtom(metricsAtom)
  const importProgressAtom = createImportProgressAtom(PERFORMANCE_TOTAL_CELLS)
  const setImportProgress = useSetAtom(importProgressAtom)
  const seedPerformanceWithProgress = (
    client: WorkerWorkbookClient,
    sheets: WorkerWorkbookBackendSheet[],
  ) =>
    seedPerformanceWorkbook(client, sheets, (importedCells, totalCells) => {
      setImportProgress({ importedCells, totalCells, done: importedCells >= totalCells })
    })
  const backend = isStaticBackend
    ? makeStaticBackend(staticSeedFor(demo.scenario))
    : isPerformanceDemo
      ? makeMeasuredWasmWorkerBackend({
          sheets: performanceSheets,
          afterInit: seedPerformanceWithProgress,
          setMetrics,
        })
      : makeWasmWorkerBackend({
          ...(isCustomFormulaDemo
            ? { sheets: customFormulaSheets, afterInit: seedCustomFormulasWorkbook }
            : isDemandDrivenDemo
              ? { sheets: demandDrivenSheets, afterInit: seedDemandDrivenWorkbook }
              : demo.scenario === 'formula-engine'
                ? { sheets: formulaEngineSheets, afterInit: seedFormulaEngineWorkbook }
                : { sheets: performanceSheets, afterInit: seedPerformanceWithProgress }),
        })

  if ('dispose' in backend) onCleanup(() => backend.dispose())

  return (
    <section
      class="demo-island"
      data-runtime={demo.runtime}
      data-spreadsheet-theme={siteTheme() === 'dark' ? 'dark' : undefined}
    >
      <aside class="demo-runtime-note" aria-label="Demo runtime">
        <strong>{isStaticBackend ? 'In-memory backend' : 'Worker + Rust/WASM'}</strong>
        <span>
          {isStaticBackend
            ? 'This scenario runs against the same backend contract with an intentionally local data host.'
            : 'The workbook engine stays in a Web Worker; the browser only renders the visible projection.'}
        </span>
      </aside>
      {isPerformanceDemo && <PerformanceHud metricsAtom={metricsAtom} />}
      {usesPerformanceSeed && (
        <ImportProgress progressAtom={importProgressAtom} locale={props.locale} />
      )}
      <DemoTour stepCount={3} locale={props.locale} />
      <DemoGrid
        backend={backend}
        rows={
          isStaticBackend || isDemandDrivenDemo || demo.scenario === 'formula-engine'
            ? 100
            : PERFORMANCE_SHEET_ROWS
        }
        columns={
          isStaticBackend || isDemandDrivenDemo || demo.scenario === 'formula-engine'
            ? 20
            : PERFORMANCE_COLS
        }
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
