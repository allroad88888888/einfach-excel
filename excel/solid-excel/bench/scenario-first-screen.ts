// 一句话：AD-508 首屏基准 —— 每个样本用一次全新 iframe 导航，量 navigation start 到首批单元格上屏。

import { runSamplingProtocol } from './stats'
import type { BenchScenario, BenchScenarioOutput } from './types'

export const FIRST_SCREEN_EMBED_PARAM = 'first-screen'
export const FIRST_SCREEN_MESSAGE_TYPE = 'einfach-bench:first-screen-sample'

const SAMPLE_TIMEOUT_MS = 120_000

export interface FirstScreenSampleMessage {
  type: typeof FIRST_SCREEN_MESSAGE_TYPE
  ms: number
  error?: string
}

function buildEmbedUrl(phase: string, index: number): string {
  const url = new URL(window.location.href)
  url.search = ''
  url.searchParams.set('bench', '1')
  url.searchParams.set('embed', FIRST_SCREEN_EMBED_PARAM)
  url.searchParams.set('sample', `${phase}-${index}-${Date.now()}`)
  const rev = new URLSearchParams(window.location.search).get('rev')
  if (rev) url.searchParams.set('rev', rev)
  return url.toString()
}

/** 一个样本 = 一次全新 iframe 导航（ADR 0009：复用已打开页面不能作为新样本）。 */
function runEmbedSample(stage: HTMLElement, phase: string, index: number): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const iframe = document.createElement('iframe')
    iframe.dataset.testid = 'bench-first-screen-frame'
    iframe.style.width = '1000px'
    iframe.style.height = '640px'
    iframe.style.border = '1px solid #ccc'

    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error(`first-screen sample timed out after ${SAMPLE_TIMEOUT_MS}ms`))
    }, SAMPLE_TIMEOUT_MS)

    function onMessage(event: MessageEvent) {
      if (event.source !== iframe.contentWindow) return
      const data = event.data as Partial<FirstScreenSampleMessage> | undefined
      if (!data || data.type !== FIRST_SCREEN_MESSAGE_TYPE) return
      cleanup()
      if (typeof data.ms === 'number' && data.error === undefined) resolve(data.ms)
      else reject(new Error(data.error ?? 'first-screen embed reported no duration'))
    }

    function cleanup() {
      window.clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
      iframe.remove()
    }

    window.addEventListener('message', onMessage)
    iframe.src = buildEmbedUrl(phase, index)
    stage.appendChild(iframe)
  })
}

async function run(context: Parameters<BenchScenario['run']>[0]): Promise<BenchScenarioOutput> {
  const primary = await runSamplingProtocol({
    sampleMeaning:
      'ms from the embed document navigation start until the seeded grid cell A1 text is rendered',
    unit: 'ms',
    onProgress: (message) => context.onProgress?.(`first-screen ${message}`),
    runSample: (phase, index) => runEmbedSample(context.stage, phase, index),
  })
  return {
    primary,
    detail: {
      entry: `/?bench=1&embed=${FIRST_SCREEN_EMBED_PARAM}`,
      firstCell: { addr: 'A1', text: 'r0c0' },
      boundary:
        'per-sample iframe navigation start (its own performance timeOrigin) → worker spawn + ' +
        'WASM fetch/instantiate + smoke-tier seed + first grid cell painted (rAF-observed)',
    },
  }
}

export const firstScreenScenario: BenchScenario = {
  id: 'first-screen-smoke',
  title: '首屏到首批单元格（smoke 档，含 WASM 拉取与实例化）',
  category: 'first-screen',
  methodologyRef: 'ADR 0009 §首屏到可交互 (docs/decisions/0009)',
  scenarioRevision: 'v1',
  dataScaleId: 'smoke',
  definition:
    '入口为 /?bench=1&embed=first-screen（1000×640 iframe，一样本一次全新导航）。' +
    '样本区间从该文档的 navigation start（performance.timeOrigin）起，包含 worker 启动、' +
    'WASM 拉取与实例化、AD-509 smoke 档（10×10）灌数，至网格 A1 单元格呈现 "r0c0" ' +
    '的那一帧（逐 rAF 判定）止。样本值由 iframe 内测得后 postMessage 回传。',
  cacheState:
    'cold document per sample; HTTP cache warm after the first load (local vite dev server)',
  run,
}
