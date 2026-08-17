// 一句话：AD-828 探针 —— 无头 chromium 驱动远程后端演示页，按阶段记录服务端计量增量。
//
// 前置：`node demo-remote/server.mjs`（端口 5303）与 vite dev（端口 5186）都已在跑。
// 用法：node excel/solid-excel/demo-remote/probe.mjs [输出.json]
//   AD828_PAGE_URL / AD828_STATS_URL 可覆盖两个地址。
// 阶段：首屏 settle → 三次单屏滚动 → 三次触边滚动（每次强制重锚）。每阶段记录
// 服务端 /api/stats 的请求数与响应字节增量，以及 DOM 里实际渲染的行区间与样本值。

import fs from 'node:fs'
import { chromium } from '@playwright/test'

const PAGE_URL = process.env.AD828_PAGE_URL ?? 'http://127.0.0.1:5186/?backend=remote&locale=en'
const STATS_URL = process.env.AD828_STATS_URL ?? 'http://127.0.0.1:5303/api/stats'
const OUT_PATH = process.argv[2] ?? 'ad828-probe.json'

async function fetchStats() {
  const res = await fetch(STATS_URL)
  if (!res.ok) throw new Error(`stats HTTP ${res.status}`)
  return res.json()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 服务端 totals 连续 4 次 200ms 轮询不变即视为 settled。 */
async function settle(maxMs = 15_000) {
  let last = null
  let stable = 0
  const startedAt = Date.now()
  while (Date.now() - startedAt < maxMs) {
    const stats = await fetchStats()
    const key = JSON.stringify(stats.totals)
    if (key === last) {
      stable += 1
      if (stable >= 4) return stats
    } else {
      stable = 0
      last = key
    }
    await sleep(200)
  }
  throw new Error('server stats never settled')
}

function diffStats(before, after) {
  const endpoints = {}
  for (const key of Object.keys(after.endpoints)) {
    endpoints[key] = {
      requests: after.endpoints[key].requests - before.endpoints[key].requests,
      responseBytes: after.endpoints[key].responseBytes - before.endpoints[key].responseBytes,
    }
  }
  return {
    endpoints,
    totals: {
      requests: after.totals.requests - before.totals.requests,
      responseBytes: after.totals.responseBytes - before.totals.responseBytes,
    },
  }
}

function domSnapshot(page) {
  return page.evaluate(() => {
    const cells = [
      ...document.querySelectorAll('[data-testid="remote-grid"] [role="gridcell"][data-row]'),
    ]
    const rows = cells.map((el) => Number(el.getAttribute('data-row')))
    const byAddr = (r, c) => {
      const el = document.querySelector(
        `[data-testid="remote-grid"] [role="gridcell"][data-row="${r}"][data-col="${c}"]`,
      )
      return el ? el.textContent : null
    }
    const minRow = rows.length ? Math.min(...rows) : null
    const maxRow = rows.length ? Math.max(...rows) : null
    return {
      renderedCellCount: cells.length,
      renderedRowRange: { minRow, maxRow },
      samples: {
        firstRenderedRowCol0: minRow === null ? null : byAddr(minRow, 0),
        firstRenderedRowCol4: minRow === null ? null : byAddr(minRow, 4),
        lastRenderedRowCol0: maxRow === null ? null : byAddr(maxRow, 0),
      },
    }
  })
}

async function main() {
  const record = {
    date: new Date().toISOString(),
    pageUrl: PAGE_URL,
    statsUrl: STATS_URL,
    phases: {},
    consoleErrors: [],
    pageErrors: [],
  }

  const statsAtStart = await fetchStats()
  record.workbook = statsAtStart.workbook

  const browser = await chromium.launch({ headless: true })
  record.browserVersion = browser.version()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('console', (msg) => {
    if (msg.type() === 'error') record.consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => record.pageErrors.push(String(err)))

  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="remote-grid"]', { timeout: 30_000 })
  await page.waitForFunction(() => {
    const el = document.querySelector(
      '[data-testid="remote-grid"] [role="gridcell"][data-row="0"][data-col="0"]',
    )
    return el !== null && el.textContent === 'R1'
  }, { timeout: 30_000 })
  record.userAgent = await page.evaluate(() => navigator.userAgent)
  const statsFirst = await settle()
  record.phases.firstScreen = {
    delta: diffStats(statsAtStart, statsFirst),
    dom: await domSnapshot(page),
  }

  const scrollOnce = (mode) =>
    page.evaluate((m) => {
      const el = document.querySelector('.spreadsheet-grid-scroll-viewport')
      if (!el) throw new Error('scroll viewport not found')
      if (m === 'screen') el.scrollTop = el.scrollTop + el.clientHeight
      else el.scrollTop = el.scrollHeight
      return {
        scrollTop: el.scrollTop,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
      }
    }, mode)

  const screenScrolls = []
  for (let i = 0; i < 3; i += 1) {
    screenScrolls.push(await scrollOnce('screen'))
    await sleep(300)
  }
  const statsScreens = await settle()
  record.phases.scrollThreeScreens = {
    scrolls: screenScrolls,
    delta: diffStats(statsFirst, statsScreens),
    dom: await domSnapshot(page),
  }

  const edgeScrolls = []
  for (let i = 0; i < 3; i += 1) {
    edgeScrolls.push(await scrollOnce('edge'))
    await sleep(500)
  }
  const statsEdges = await settle()
  record.phases.scrollThreeEdgePushes = {
    scrolls: edgeScrolls,
    delta: diffStats(statsScreens, statsEdges),
    dom: await domSnapshot(page),
  }

  record.finalTotals = statsEdges.totals
  record.finalEndpoints = statsEdges.endpoints

  await browser.close()
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(record, null, 2)}\n`)
  process.stdout.write(`wrote ${OUT_PATH}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error && error.stack ? error.stack : String(error)}\n`)
  process.exit(1)
})
