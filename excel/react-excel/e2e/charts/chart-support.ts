import { expect, type Locator, type Page } from '@playwright/test'

export const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
export const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const frames = (page: Page) => page.locator('.drawing-frame[data-drawing-kind="chart"]')
export const frame = (page: Page, id: string) => page.locator(`.drawing-frame[data-drawing-id="${id}"]`)
export const settings = (page: Page) => page.getByRole('dialog', { name: 'Chart settings' })

export interface ChartSnapshot {
  readonly title: string
  readonly categories: readonly unknown[]
  readonly series: readonly { type: string; name: string; values: readonly unknown[] }[]
}

/**
 * ECharts 实例只是 DOM 资源：在 Vite 开发服务器上，页面可以用与插件相同的模块 URL
 * 取回 `getInstanceByDom`，直接读出画布实际使用的配置，而不是猜像素。
 * 必须在 `page.goto` 之前调用，才能捕获到模块请求。
 */
export function trackECharts(page: Page) {
  let core: string | undefined
  page.on('request', (request) => {
    if (/echarts_core\.js/.test(request.url())) core = request.url()
  })
  return async (id: string): Promise<ChartSnapshot> => {
    await expect.poll(() => core, { message: 'ECharts module was requested' }).toBeTruthy()
    return page.evaluate(async ({ url, chartId }) => {
      const mod = await import(/* @vite-ignore */ url)
      const host = document.querySelector(`.drawing-frame[data-drawing-id="${chartId}"] .plugin-chart-canvas`)
      const instance = host && mod.getInstanceByDom(host)
      if (!instance) return { title: '', categories: [], series: [] }
      const option = instance.getOption() as {
        title?: { text?: string }[]
        xAxis?: { data?: unknown[] }[]
        series?: { type: string; name: string; data?: ({ value?: unknown } | unknown)[] }[]
      }
      const plain = (entry: unknown) => entry !== null && typeof entry === 'object' &&
        'value' in (entry as object) ? (entry as { value: unknown }).value : entry
      return {
        title: option.title?.[0]?.text ?? '',
        categories: option.xAxis?.[0]?.data ?? [],
        series: (option.series ?? []).map((series) => ({
          type: series.type, name: series.name, values: (series.data ?? []).map(plain),
        })),
      }
    }, { url: core!, chartId: id })
  }
}

export type ChartProbe = ReturnType<typeof trackECharts>

export async function openWorkbook(page: Page, query: string) {
  await page.goto(`/${query}`)
  await expect(cell(page, '1:0')).toBeVisible()
}

/** 点选左上角，再按住 Shift 点选右下角，得到一个真实的鼠标选区。 */
export async function selectBy(page: Page, from: string, to: string) {
  await cell(page, from).click()
  await cell(page, to).click({ modifiers: ['Shift'] })
}

export async function openInsertTab(page: Page) {
  await page.getByRole('tab', { name: 'Insert', exact: true }).click()
}

export async function insertChart(page: Page, type: string) {
  await openInsertTab(page)
  await page.locator(`[data-chart-type="${type}"]`).click()
}

export async function box(locator: Locator) {
  const rect = await locator.boundingBox()
  if (!rect) throw new Error('element has no box')
  return rect
}

/** 在 Go to 对话框里输入引用并选中，用于超出可见区的范围。 */
export async function goTo(page: Page, reference: string) {
  await button(page, 'Go to').click()
  await page.getByLabel('Reference', { exact: true }).fill(reference)
  await button(page, 'Go').click()
}

export async function pressMod(page: Page, key: string) {
  await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+${key}`)
}
