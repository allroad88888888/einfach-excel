/**
 * `WorkbenchTour` — the guided-tour rail for `/workbench`. Rendered inside
 * `SpreadsheetChrome`'s provider (see `WorkbenchPage.tsx`), so
 * `useSpreadsheetUiStore` resolves. Four steps (`../tour-steps.ts`), each a
 * numbered list item with a title + one-line description; clicking a step,
 * Next, Back, or Restart runs that step's choreography against the live
 * workbook. State (active step, visited set) is per-instance `createSignal`
 * locals — the dialog-pattern convention this repo uses instead of atoms for
 * component-local UI state.
 */
import type { Component } from 'solid-js'
import { For, Show, createSignal } from 'solid-js'
import { useSpreadsheetUiStore } from '@einfach/solid-excel/vnext'
import { useLocale } from '../../i18n/use-site-t'
import { TOUR_STEPS, type TourStepId } from './tour-steps'
import './tour.css'

const copy = {
  en: {
    heading: 'Guided tour',
    subheading:
      'Every step runs on the live workbook — keep typing, undoing, or navigating after it lands.',
    back: 'Back',
    next: 'Next',
    restart: 'Restart',
    steps: {
      formula: {
        title: 'Read a real formula',
        description: "Select North America's Full-Year cell — the formula bar shows =SUM(C7:F7).",
      },
      aggregate: {
        title: 'Select and aggregate',
        description:
          'Select the Q1–Q4 block across all six regions — the status bar computes sum, average, and count live.',
      },
      edit: {
        title: 'Edit a source number',
        description:
          'Type a new Q1 number for North America and press Enter — watch Full-Year and the KPI strip recalc.',
      },
      forecast: {
        title: 'Cross-sheet, for real',
        description: 'Jump to Forecast — Forecast!B4 reads =Overview!G14, a genuine cross-sheet reference.',
      },
    },
  },
  zh: {
    heading: '导览',
    subheading: '每一步都直接作用于左侧的真实工作簿——落地后仍可继续输入、撤销或切换。',
    back: '上一步',
    next: '下一步',
    restart: '重新开始',
    steps: {
      formula: {
        title: '读懂一条真实公式',
        description: '选中"北美"的全年收入单元格——公式栏显示 =SUM(C7:F7)。',
      },
      aggregate: {
        title: '框选并即时汇总',
        description: '框选六个区域的 Q1–Q4 数据区——状态栏实时计算求和、平均值与计数。',
      },
      edit: {
        title: '直接修改源数据',
        description: '为"北美"输入新的 Q1 数值并回车——全年收入与 KPI 区会立即联动。',
      },
      forecast: {
        title: '真正的跨表引用',
        description: '切换到 Forecast——Forecast!B4 的公式是 =Overview!G14，一条真实的跨表引用。',
      },
    },
  },
} as const

const LAST_STEP_INDEX = TOUR_STEPS.length - 1

const WorkbenchTour: Component = () => {
  const store = useSpreadsheetUiStore()
  const locale = useLocale()
  const t = () => copy[locale()]

  const [activeIndex, setActiveIndex] = createSignal(0)
  const [visited, setVisited] = createSignal<ReadonlySet<TourStepId>>(new Set())

  function runStep(index: number) {
    const step = TOUR_STEPS[index]
    if (!step) return
    setActiveIndex(index)
    step.run(store)
    setVisited((prev) => new Set<TourStepId>(prev).add(step.id))
  }

  function next() {
    runStep(Math.min(activeIndex() + 1, LAST_STEP_INDEX))
  }

  function back() {
    runStep(Math.max(activeIndex() - 1, 0))
  }

  function restart() {
    setVisited(new Set<TourStepId>())
    runStep(0)
  }

  return (
    <div class="site-tour" aria-label={t().heading}>
      <div class="site-tour-heading">
        <span class="site-tour-eyebrow">{t().heading}</span>
        <span class="site-tour-counter">
          {activeIndex() + 1} / {TOUR_STEPS.length}
        </span>
      </div>
      <p class="site-tour-subheading">{t().subheading}</p>

      <ol class="site-tour-steps">
        <For each={TOUR_STEPS}>
          {(step, index) => {
            const stepCopy = () => t().steps[step.id]
            return (
              <li>
                <button
                  type="button"
                  class="site-tour-step"
                  classList={{ 'site-tour-step--active': index() === activeIndex() }}
                  aria-current={index() === activeIndex() ? 'step' : undefined}
                  onClick={() => runStep(index())}
                >
                  <span class="site-tour-step-index">
                    <Show when={visited().has(step.id)} fallback={index() + 1}>
                      &#10003;
                    </Show>
                  </span>
                  <span class="site-tour-step-copy">
                    <strong>{stepCopy().title}</strong>
                    <small>{stepCopy().description}</small>
                  </span>
                </button>
              </li>
            )
          }}
        </For>
      </ol>

      <div class="site-tour-actions">
        <button
          type="button"
          class="site-tour-button"
          disabled={activeIndex() === 0}
          onClick={back}
        >
          {t().back}
        </button>
        <button
          type="button"
          class="site-tour-button site-tour-button--primary"
          disabled={activeIndex() === LAST_STEP_INDEX}
          onClick={next}
        >
          {t().next}
        </button>
        <button type="button" class="site-tour-button site-tour-button--ghost" onClick={restart}>
          {t().restart}
        </button>
      </div>
    </div>
  )
}

export default WorkbenchTour
