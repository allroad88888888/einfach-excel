import { createSignal, For, Show } from 'solid-js'
import type { Component } from 'solid-js'
import {
  SpreadsheetSmokeDemo,
  SpreadsheetTsWorkerDemo,
  SpreadsheetWorkbenchDemo,
  SpreadsheetWorkerDemo,
} from '../src/demos'
import { DemoBlank } from '../legacy/demos/DemoBlank'
import { DemoBudget } from '../legacy/demos/DemoBudget'
import { DemoCrossSheetChain } from '../legacy/demos/DemoCrossSheetChain'
import { DemoFormulas } from '../legacy/demos/DemoFormulas'
import { DemoGrades } from '../legacy/demos/DemoGrades'
import { DemoLarge } from '../legacy/demos/DemoLarge'
import { DemoMillion } from '../legacy/demos/DemoMillion'
import { DemoSales } from '../legacy/demos/DemoSales'
import { DemoWorker } from '../legacy/demos/DemoWorker'
import { MultiSheet } from '../legacy/demos/MultiSheet'
import { RemoteViewportDemo } from '../demo-remote/RemoteViewportDemo'
import { useT } from '../src/i18n'
import { LocaleSwitcher } from './LocaleSwitcher'
import './app-shell.css'
import './navigation.css'
import './import-toolbar.css'
import './legacy-table.css'
import '@einfach/spreadsheet-ui-styles/styles.css'

interface DemoTab {
  id: string
  labelKey: string
  component: Component
}

interface DemoGroup {
  id: string
  demos: DemoTab[]
}

const currentGroups: DemoGroup[] = [{
  id: 'current',
  demos: [
    { id: 'vnext', labelKey: 'nav.vnext', component: SpreadsheetSmokeDemo },
    { id: 'vnext-worker', labelKey: 'nav.vnextWorker', component: SpreadsheetWorkerDemo },
    { id: 'vnext-worker-ts', labelKey: 'nav.vnextWorkerTs', component: SpreadsheetTsWorkerDemo },
    { id: 'vnext-wave5', labelKey: 'nav.vnextWave5', component: SpreadsheetWorkbenchDemo },
    { id: 'vnext-remote', labelKey: 'nav.vnextRemote', component: RemoteViewportDemo },
  ],
}]

const legacyGroups: DemoGroup[] = [
  { id: 'basics', demos: [
    { id: 'blank', labelKey: 'nav.blank', component: DemoBlank },
    { id: 'formulas', labelKey: 'nav.formulas', component: DemoFormulas },
  ] },
  { id: 'apps', demos: [
    { id: 'budget', labelKey: 'nav.budget', component: DemoBudget },
    { id: 'grades', labelKey: 'nav.grades', component: DemoGrades },
    { id: 'sales', labelKey: 'nav.sales', component: DemoSales },
  ] },
  { id: 'workbook', demos: [
    { id: 'multi', labelKey: 'nav.multi', component: MultiSheet },
    { id: 'cross', labelKey: 'nav.cross', component: DemoCrossSheetChain },
  ] },
  { id: 'perf', demos: [
    { id: 'large', labelKey: 'nav.large', component: DemoLarge },
    { id: 'worker', labelKey: 'nav.worker', component: DemoWorker },
    { id: 'million', labelKey: 'nav.million', component: DemoMillion },
  ] },
]

function queryFlag(name: string): boolean {
  return typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get(name) === '1'
}

function initialTabId(legacy: boolean): string {
  if (legacy) return 'blank'
  if (typeof window === 'undefined') return 'vnext-wave5'
  return new URLSearchParams(window.location.search).get('backend') === 'remote'
    ? 'vnext-remote'
    : 'vnext-wave5'
}

function initialTheme(): 'dark' | undefined {
  if (typeof window === 'undefined') return undefined
  return new URLSearchParams(window.location.search).get('theme') === 'dark' ? 'dark' : undefined
}

export function App() {
  const legacy = queryFlag('legacy')
  const groups = legacy ? legacyGroups : currentGroups
  const demos = groups.flatMap((group) => group.demos)
  const [activeTab, setActiveTab] = createSignal(initialTabId(legacy))
  const t = useT()
  const activeDemo = () => demos.find((demo) => demo.id === activeTab())

  return (
    <div class="app" data-spreadsheet-theme={initialTheme()}>
      <header class="app-header">
        <h1 class="app-title">{t('app.title')}</h1>
        <span class="app-subtitle">{t('app.subtitle')}</span>
        <LocaleSwitcher />
      </header>
      <nav class="tab-bar">
        <For each={groups}>
          {(group, groupIndex) => (
            <>
              <Show when={groupIndex() > 0}>
                <span class="nav-group-sep" aria-hidden="true" />
              </Show>
              <For each={group.demos}>
                {(demo) => (
                  <button
                    class={`tab-btn ${activeTab() === demo.id ? 'tab-active' : ''}`}
                    data-testid={`nav-tab-${demo.id}`}
                    onClick={() => setActiveTab(demo.id)}
                  >
                    {t(demo.labelKey)}
                  </button>
                )}
              </For>
            </>
          )}
        </For>
      </nav>
      <main class="app-main">
        <Show when={activeDemo()} keyed>
          {(demo) => {
            const Demo = demo.component
            return <Demo />
          }}
        </Show>
      </main>
    </div>
  )
}
