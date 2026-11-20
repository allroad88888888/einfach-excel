import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { button, cell, frame, openWorkbook, settings, trackECharts } from '../charts/chart-support'
import { showRibbonItem } from '../support/ribbon'

test.use({ viewport: { width: 1440, height: 1500 } })

const TITLE = 'Monthly revenue by region (k)'

function captureEChartsUrl(page: Page) {
  const ref = { url: '' }
  page.on('request', (request) => {
    if (/echarts_core\.js/.test(request.url())) ref.url = request.url()
  })
  return ref
}

/**
 * Finds the exact viewport coordinates on the rendered ECharts canvas where ZRender's
 * hit-testing resolves to the requested `componentType` ('title' | 'legend' | 'xAxis' | 'series').
 */
async function findChartElementPoint(
  page: Page,
  echartsUrl: string,
  chartId: string,
  componentType: 'title' | 'legend' | 'xAxis' | 'series',
) {
  return page.evaluate(
    async ({ url, id, target }) => {
      const host = document.querySelector(
        `.drawing-frame[data-drawing-id="${id}"] .plugin-chart-canvas`,
      ) as HTMLElement | null
      if (!host) throw new Error(`Missing chart canvas for ${id}`)
      const { getInstanceByDom } = await import(/* @vite-ignore */ url)
      const instance = getInstanceByDom(host)
      const rect = host.getBoundingClientRect()
      if (target === 'series') {
        const bar = instance.getModel().getSeriesByIndex(0).getData().getItemLayout(0) as {
          x: number
          y: number
          width: number
          height: number
        }
        return { x: rect.x + bar.x + bar.width / 2, y: rect.y + bar.y + bar.height / 2 }
      }
      const zr = instance.getZr()
      const hasComponentType = (el: Record<string, unknown>, kind: string) =>
        Object.entries(el).some(
          ([key, value]) =>
            key.startsWith('__ec_inner_') &&
            value !== null &&
            typeof value === 'object' &&
            (value as { eventData?: { componentType?: string } }).eventData?.componentType === kind,
        )
      for (let y = 6; y < rect.height - 6; y += 4) {
        for (let x = 8; x < rect.width - 8; x += 6) {
          let node = zr.handler.findHover(x, y)?.target as
            | (Record<string, unknown> & { parent?: unknown })
            | undefined
          while (node) {
            if (hasComponentType(node, target)) {
              return { x: rect.x + x, y: rect.y + y }
            }
            node = node.parent as typeof node
          }
        }
      }
      throw new Error(`Could not find rendered ECharts element for componentType=${target}`)
    },
    { url: echartsUrl, id: chartId, target: componentType },
  )
}

test('CHART-024: double-clicking chart title, legend, axis, or series opens settings and focuses the matching section', async ({
  page,
}) => {
  const echartsRef = captureEChartsUrl(page)
  const option = trackECharts(page)
  await openWorkbook(page, '?demo=charts')
  await expect.poll(async () => (await option('chart-revenue')).title).toBe(TITLE)

  // 1. Double-click chart title -> opens settings at 'title' section and focuses Chart title input.
  const titlePt = await findChartElementPoint(page, echartsRef.url, 'chart-revenue', 'title')
  await page.mouse.dblclick(titlePt.x, titlePt.y)
  await expect(settings(page)).toBeVisible()
  await expect(settings(page)).toHaveAttribute('data-active-section', 'title')
  await expect(settings(page).getByLabel('Chart title')).toBeFocused()

  // 2. Double-click legend -> switches active section to 'legend' and focuses Legend select.
  const legendPt = await findChartElementPoint(page, echartsRef.url, 'chart-revenue', 'legend')
  await page.mouse.dblclick(legendPt.x, legendPt.y)
  await expect(settings(page)).toHaveAttribute('data-active-section', 'legend')
  await expect(settings(page).getByLabel('Legend')).toBeFocused()

  // 3. Double-click horizontal axis label -> switches to 'axis' section and focuses Horizontal axis title.
  const axisPt = await findChartElementPoint(page, echartsRef.url, 'chart-revenue', 'xAxis')
  await page.mouse.dblclick(axisPt.x, axisPt.y)
  await expect(settings(page)).toHaveAttribute('data-active-section', 'axis')
  await expect(settings(page).getByLabel('Horizontal axis title')).toBeFocused()

  // 4. Double-click data series bar -> switches to 'series' section and focuses first series control.
  const seriesPt = await findChartElementPoint(page, echartsRef.url, 'chart-revenue', 'series')
  await page.mouse.dblclick(seriesPt.x, seriesPt.y)
  await expect(settings(page)).toHaveAttribute('data-active-section', 'series')
  await expect(settings(page).getByLabel('Stacking')).toBeFocused()
})

test('CHART-025: dark surface theme restyles canvas and SVG export, supports undo, and survives workbook save and reopen', async ({
  page,
}) => {
  const echartsRef = captureEChartsUrl(page)
  const option = trackECharts(page)
  await openWorkbook(page, '?demo=charts')
  await expect.poll(async () => (await option('chart-revenue')).title).toBe(TITLE)

  const chartRoot = frame(page, 'chart-revenue').locator('.plugin-chart')
  await expect(chartRoot).not.toHaveAttribute('data-dark', 'true')

  await frame(page, 'chart-revenue').dblclick({ position: { x: 280, y: 150 } })
  await expect(settings(page)).toBeVisible()
  const darkToggle = settings(page).getByRole('checkbox', { name: 'Dark surface', exact: true })
  await expect(darkToggle).not.toBeChecked()
  await darkToggle.click()
  await expect(darkToggle).toBeChecked()
  await expect(chartRoot).toHaveAttribute('data-dark', 'true')

  // Verify live ECharts option uses coordinated dark background, text, and gridlines.
  const darkTheme = await page.evaluate(async (url) => {
    const host = document.querySelector(
      '.drawing-frame[data-drawing-id="chart-revenue"] .plugin-chart-canvas',
    ) as HTMLElement
    const { getInstanceByDom } = await import(/* @vite-ignore */ url)
    const opt = getInstanceByDom(host).getOption() as {
      backgroundColor?: string
      textStyle?: { color?: string }
      yAxis?: { splitLine?: { lineStyle?: { color?: string } } }[]
    }
    return {
      bg: opt.backgroundColor,
      text: opt.textStyle?.color,
      grid: opt.yAxis?.[0]?.splitLine?.lineStyle?.color,
    }
  }, echartsRef.url)
  expect(darkTheme).toEqual({ bg: '#1c1b27', text: '#e6e5f0', grid: '#2e2d3d' })

  // Exported SVG preserves the dark canvas background (#1c1b27).
  const svgDownload = page.waitForEvent('download')
  await settings(page).getByRole('button', { name: 'Download SVG', exact: true }).click()
  const svgContent = await readFile((await (await svgDownload).path())!, 'utf8')
  expect(svgContent.toLowerCase()).toContain('#1c1b27')

  // Undo reverts dark surface; Redo restores it.
  await button(page, 'Undo').click()
  await expect(darkToggle).not.toBeChecked()
  await expect(chartRoot).not.toHaveAttribute('data-dark', 'true')
  await button(page, 'Redo').click()
  await expect(darkToggle).toBeChecked()
  await expect(chartRoot).toHaveAttribute('data-dark', 'true')

  // Save native .einfach.json and reopen -> dark surface persists.
  await settings(page).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(settings(page)).toHaveCount(0)
  await button(page, 'File').click()
  const bookDownload = page.waitForEvent('download')
  await button(page, 'Download workbook').click()
  const savedJson = await readFile((await (await bookDownload).path())!, 'utf8')
  await button(page, 'Close').click()

  await openWorkbook(page, '?plugins=chart')
  await button(page, 'File').click()
  page.once('dialog', (prompt) => prompt.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({
    name: 'DarkCharts.einfach.json',
    mimeType: 'application/json',
    buffer: Buffer.from(savedJson, 'utf8'),
  })
  await expect(frame(page, 'chart-revenue').locator('.plugin-chart')).toHaveAttribute(
    'data-dark',
    'true',
  )
})

test('CHART-026: chart refresh skips disjoint formatting or object moves while updating formula-driven series immediately', async ({
  page,
}) => {
  const echartsRef = captureEChartsUrl(page)
  const option = trackECharts(page)
  await openWorkbook(page, '?demo=charts')
  await expect.poll(async () => (await option('chart-revenue')).series[0]?.values[0]).toBe(120)
  await expect.poll(async () => (await option('chart-quarters')).series[0]?.values[0]).toBe(417)

  // Spy on ECharts setOption calls on chart-revenue (data range A3:E15).
  await page.evaluate(async (url) => {
    const host = document.querySelector(
      '.drawing-frame[data-drawing-id="chart-revenue"] .plugin-chart-canvas',
    ) as HTMLElement
    const { getInstanceByDom } = await import(/* @vite-ignore */ url)
    const inst = getInstanceByDom(host)
    const orig = inst.setOption.bind(inst)
    ;(window as unknown as { __chartSetOptionCalls: number }).__chartSetOptionCalls = 0
    inst.setOption = ((...args: Parameters<typeof orig>) => {
      ;(window as unknown as { __chartSetOptionCalls: number }).__chartSetOptionCalls += 1
      return orig(...args)
    }) as typeof orig
  }, echartsRef.url)

  // 1. Formatting a disjoint cell (I4 / coord 3:8) must NOT redraw chart-revenue.
  await cell(page, '3:8').click()
  await page.keyboard.type('Note')
  await page.keyboard.press('Enter')
  // Wait for value edit to settle, reset spy, then apply disjoint formatting on I4.
  await expect(cell(page, '3:8')).toHaveText('Note')
  await page.evaluate(() => {
    ;(window as unknown as { __chartSetOptionCalls: number }).__chartSetOptionCalls = 0
  })
  await cell(page, '3:8').click()
  await showRibbonItem(page, 'font.bold')
  await button(page, 'Bold').click()
  await expect(cell(page, '3:8')).toHaveCSS('font-weight', '700')

  // 2. Dragging another chart (chart-trend) must also NOT redraw chart-revenue.
  const trendBox = (await frame(page, 'chart-trend').boundingBox())!
  await page.mouse.move(trendBox.x + 20, trendBox.y + 12)
  await page.mouse.down()
  await page.mouse.move(trendBox.x + 60, trendBox.y + 12, { steps: 4 })
  await page.mouse.up()

  const skippedCalls = await page.evaluate(
    () => (window as unknown as { __chartSetOptionCalls: number }).__chartSetOptionCalls,
  )
  expect(skippedCalls).toBe(0)

  // 3. Editing B4 (3:1 = 120 -> 420) updates BOTH chart-revenue AND formula-driven chart-quarters (G12 = SUM(B4:B6)).
  await cell(page, '3:1').click()
  await page.keyboard.type('420')
  await page.keyboard.press('Enter')
  await expect(cell(page, '3:1')).toHaveText('420')
  await expect.poll(async () => (await option('chart-revenue')).series[0]?.values[0]).toBe(420)
  await expect.poll(async () => (await option('chart-quarters')).series[0]?.values[0]).toBe(717)
})
