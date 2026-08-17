// 一句话：基准页面壳 —— 列出登记场景、驱动 run()、展示可复制的结果 JSON；无场景时显式渲染「无此场景」。

import { createSignal, For, Show } from 'solid-js'
import { getBenchScenario, listBenchScenarios } from './registry'
import { runBenchScenario } from './run-scenario'
import type { BenchScenario, BenchScenarioResult } from './types'

declare global {
  interface Window {
    /** 最近一次完成的场景结果；供自动化驱动（Playwright 等）直接读取。 */
    __einfachBenchLastResult?: BenchScenarioResult
  }
}

function visibleScenarios(): { scenarios: readonly BenchScenario[]; missing: boolean } {
  const requested = new URLSearchParams(window.location.search).get('scenario')
  const all = listBenchScenarios()
  if (requested !== null) {
    const found = getBenchScenario(requested)
    return { scenarios: found ? [found] : [], missing: !found }
  }
  return { scenarios: all, missing: all.length === 0 }
}

function ScenarioCard(props: {
  scenario: BenchScenario
  running: () => string | null
  onRun: (scenario: BenchScenario) => void
}) {
  const { scenario } = props
  return (
    <section
      data-testid={`bench-scenario-${scenario.id}`}
      style={{ border: '1px solid #ccc', 'border-radius': '6px', padding: '12px' }}
    >
      <h2 style={{ margin: '0 0 4px' }}>{scenario.title}</h2>
      <p style={{ margin: '0 0 4px', color: '#555' }}>
        id: <code>{scenario.id}</code> · {scenario.methodologyRef} · 档位:{' '}
        <code>{scenario.dataScaleId}</code> · 修订: {scenario.scenarioRevision}
      </p>
      <p style={{ margin: '0 0 8px', 'font-size': '13px', color: '#555' }}>
        {scenario.definition}
      </p>
      <button
        data-testid={`bench-run-${scenario.id}`}
        disabled={props.running() !== null}
        onClick={() => props.onRun(scenario)}
      >
        {props.running() === scenario.id ? '运行中…' : '运行'}
      </button>
    </section>
  )
}

export function BenchApp() {
  const { scenarios, missing } = visibleScenarios()
  const [running, setRunning] = createSignal<string | null>(null)
  const [progress, setProgress] = createSignal('')
  const [error, setError] = createSignal('')
  const [copied, setCopied] = createSignal('')
  const [result, setResult] = createSignal<BenchScenarioResult | null>(null)
  let stage: HTMLDivElement | undefined

  async function runScenario(scenario: BenchScenario) {
    if (!stage || running() !== null) return
    setRunning(scenario.id)
    setError('')
    setCopied('')
    setResult(null)
    try {
      const scenarioResult = await runBenchScenario(scenario, {
        stage,
        onProgress: setProgress,
      })
      window.__einfachBenchLastResult = scenarioResult
      setResult(scenarioResult)
      setProgress('done')
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError))
    } finally {
      stage.replaceChildren()
      setRunning(null)
    }
  }

  async function copyResult() {
    const current = result()
    if (!current) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(current, null, 2))
      setCopied('已复制')
    } catch {
      setCopied('复制失败：浏览器拒绝了剪贴板访问，请手动全选下方 JSON')
    }
  }

  return (
    <div style={{ padding: '16px', 'max-width': '1100px', margin: '0 auto' }}>
      <header>
        <h1 style={{ margin: '0 0 4px' }}>einfach-excel 性能基准页（AD-505）</h1>
        <p style={{ margin: '0 0 4px', color: '#555' }}>
          证据范围与口径：docs/decisions/0008（类别）、0009（采样：每场景 5 预热 + 20
          有效样本，报中位数与 p95 并保留原始样本）、0011（环境记录）。
        </p>
        <p style={{ margin: '0 0 12px', color: '#555' }}>
          本页任何数字都是一次具名运行的观测证据，不构成产品承诺（docs/decisions/0010）。
        </p>
      </header>

      <Show
        when={!missing && scenarios.length > 0}
        fallback={<p data-testid="bench-no-scenario">无此场景</p>}
      >
        <div style={{ display: 'grid', gap: '12px' }}>
          <For each={[...scenarios]}>
            {(scenario) => (
              <ScenarioCard scenario={scenario} running={running} onRun={runScenario} />
            )}
          </For>
        </div>
      </Show>

      <p data-testid="bench-progress" style={{ 'min-height': '1.2em', color: '#333' }}>
        {progress()}
      </p>
      <Show when={error()}>
        <p data-testid="bench-error" style={{ color: '#b00020' }}>
          运行失败：{error()}
        </p>
      </Show>

      <div ref={stage} data-testid="bench-stage" />

      <Show when={result()} keyed>
        {(current) => (
          <section data-testid="bench-result" style={{ 'margin-top': '16px' }}>
            <h2 style={{ margin: '0 0 8px' }}>结果（{current.scenarioId}）</h2>
            <button data-testid="bench-copy-json" onClick={() => void copyResult()}>
              复制 JSON
            </button>
            <span style={{ 'margin-left': '8px', color: '#555' }}>{copied()}</span>
            <pre
              data-testid="bench-result-json"
              data-scenario={current.scenarioId}
              style={{
                'max-height': '420px',
                overflow: 'auto',
                background: '#f6f6f6',
                padding: '12px',
                'font-size': '12px',
              }}
            >
              {JSON.stringify(current, null, 2)}
            </pre>
          </section>
        )}
      </Show>
    </div>
  )
}
