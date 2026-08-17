// 一句话：采集 ADR 0011 环境记录 —— 只写浏览器可观察值，取不到的字段写 "unknown" 并附原因。

import type { BenchEnvironmentRecord, BenchScenario } from './types'

interface UADataBrand {
  brand: string
  version: string
}

interface UAData {
  brands?: UADataBrand[]
  platform?: string
}

interface BatteryLike {
  charging: boolean
}

type NavigatorWithExtras = Navigator & {
  userAgentData?: UAData
  deviceMemory?: number
  getBattery?: () => Promise<BatteryLike>
}

const UNKNOWN = 'unknown'

function pickBrand(brands: UADataBrand[] | undefined): UADataBrand | undefined {
  if (!brands) return undefined
  const real = brands.filter((entry) => !/not.a.brand/i.test(entry.brand))
  return (
    real.find((entry) => !/^chromium$/i.test(entry.brand)) ??
    real.find((entry) => /^chromium$/i.test(entry.brand))
  )
}

type BrowserFields = { name: string; version: string; engine: { name: string; version: string } }

function detectBrowser(): BrowserFields {
  const nav = navigator as NavigatorWithExtras
  const ua = nav.userAgent
  const brand = pickBrand(nav.userAgentData?.brands)
  const chromeMatch = ua.match(/(?:Chrome|Chromium)\/([\d.]+)/)
  const firefoxMatch = ua.match(/Firefox\/([\d.]+)/)
  const safariMatch = ua.match(/Version\/([\d.]+).*Safari/)
  if (chromeMatch) {
    return {
      name: brand?.brand ?? 'Chromium',
      version: brand?.version ?? chromeMatch[1],
      engine: { name: 'Blink', version: chromeMatch[1] },
    }
  }
  if (firefoxMatch) {
    return {
      name: 'Firefox',
      version: firefoxMatch[1],
      engine: { name: 'Gecko', version: firefoxMatch[1] },
    }
  }
  if (safariMatch) {
    return {
      name: 'Safari',
      version: safariMatch[1],
      engine: { name: 'WebKit', version: ua.match(/AppleWebKit\/([\d.]+)/)?.[1] ?? UNKNOWN },
    }
  }
  return { name: UNKNOWN, version: UNKNOWN, engine: { name: UNKNOWN, version: UNKNOWN } }
}

function detectOs(): { name: string; version: string; architecture: string } {
  const nav = navigator as NavigatorWithExtras
  const ua = nav.userAgent
  const name = nav.userAgentData?.platform ?? nav.platform ?? UNKNOWN
  const macMatch = ua.match(/Mac OS X ([\d_.]+)/)
  const winMatch = ua.match(/Windows NT ([\d.]+)/)
  const version = macMatch
    ? macMatch[1].replace(/_/g, '.')
    : (winMatch?.[1] ?? `${UNKNOWN} (UA string carries no OS version)`)
  return {
    name,
    version,
    architecture: `${UNKNOWN} (not observable from the browser)`,
  }
}

/** vite dev 会注入 /@vite/client 脚本；据此区分 dev 与构建产物，避免依赖编译期宏。 */
function detectBuildProfile(): string {
  const devClient = document.querySelector('script[src*="/@vite/client"]')
  return devClient ? 'vite-dev' : 'vite-build'
}

async function detectPowerState(): Promise<string> {
  const nav = navigator as NavigatorWithExtras
  if (typeof nav.getBattery !== 'function') {
    return `${UNKNOWN} (Battery Status API unavailable)`
  }
  try {
    const battery = await nav.getBattery()
    return battery.charging ? 'ac' : 'battery'
  } catch {
    return `${UNKNOWN} (Battery Status API rejected)`
  }
}

/** 空转 rAF 采样估计显示刷新率；结果取中位帧间隔的倒数并四舍五入。 */
export async function estimateDisplayRefreshHz(): Promise<number | 'unknown'> {
  const intervals: number[] = []
  let previous: number | undefined
  await new Promise<void>((resolve) => {
    function tick(timestamp: number) {
      if (previous !== undefined) intervals.push(timestamp - previous)
      previous = timestamp
      if (intervals.length >= 30) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const sorted = intervals.sort((a, b) => a - b)
  const mid = sorted[Math.floor(sorted.length / 2)]
  if (!mid || mid <= 0) return UNKNOWN
  return Math.round(1000 / mid)
}

export interface CollectEnvironmentOptions {
  scenario: Pick<BenchScenario, 'id' | 'scenarioRevision' | 'dataScaleId'>
  dataDefinition: string
  cacheState: string
}

export async function collectEnvironmentRecord(
  options: CollectEnvironmentOptions,
): Promise<BenchEnvironmentRecord> {
  const nav = navigator as NavigatorWithExtras
  const capturedAt = new Date().toISOString()
  const revParam = new URLSearchParams(window.location.search).get('rev')
  const [powerState, displayRefreshHz] = await Promise.all([
    detectPowerState(),
    estimateDisplayRefreshHz(),
  ])
  return {
    schema: 'einfach.performance-environment/v1',
    runId: `${options.scenario.id}-${options.scenario.scenarioRevision}-${capturedAt}`,
    capturedAt,
    implementation: {
      sourceRevision:
        revParam ?? `${UNKNOWN} (git revision is not browser-observable; pass &rev=<commit>)`,
      buildProfile: detectBuildProfile(),
      packageVersions: {
        '@einfach/solid-excel': 'source',
        '@einfach/excel-wasm': 'source',
        '@einfach/spreadsheet-ui-core': 'source',
      },
    },
    machine: {
      os: detectOs(),
      cpu: {
        model: `${UNKNOWN} (not observable from the browser)`,
        logicalCores: nav.hardwareConcurrency ?? UNKNOWN,
      },
      memoryGiB: nav.deviceMemory ?? UNKNOWN,
      powerState,
      displayRefreshHz,
    },
    browser: {
      ...detectBrowser(),
      headless: nav.webdriver === true,
      viewportCssPx: { width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
    },
    conditions: {
      cacheState: options.cacheState,
      network: 'local-loopback vite dev server (no remote network)',
      backgroundLoad: `${UNKNOWN} (not instrumented)`,
    },
    workload: {
      scenarioId: options.scenario.id,
      scenarioRevision: options.scenario.scenarioRevision,
      dataScaleId: options.scenario.dataScaleId,
      dataDefinition: options.dataDefinition,
    },
  }
}
