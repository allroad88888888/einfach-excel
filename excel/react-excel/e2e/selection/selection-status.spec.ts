import { expect, test, type Page } from '@playwright/test'

const status = (page: Page) => page.getByRole('status', { name: 'Selection statistics' })
async function select(page: Page, address: string) {
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill(address)
  await name.press('Enter')
  await expect(name).toHaveValue(address)
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-projection-retained', 'false')
}
async function summary(page: Page) {
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'A93:F93')
}
async function stats(page: Page, count: number, sum: string, average: string) {
  await expect(status(page)).toContainText(`Numerical count: ${count}`)
  await expect(status(page)).toContainText(`Sum: ${sum}`)
  await expect(status(page)).toContainText(`Average: ${average}`)
  await expect(status(page)).not.toContainText('Calculating selection')
}
async function extrema(page: Page, count: number, min: string, max: string) {
  await expect(status(page).getByText(`Count: ${count}`, { exact: true })).toBeVisible()
  await expect(status(page).getByText(`Min: ${min}`, { exact: true })).toBeVisible()
  await expect(status(page).getByText(`Max: ${max}`, { exact: true })).toBeVisible()
}

test('seed types use native numbers, and editing, undo and redo refresh statistics', async ({ page }) => {
  await summary(page)
  await stats(page, 4, '26', '6.5')
  await extrema(page, 6, '-4', '20')
  await page.locator('td[data-cell="92:0"]').dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor' })
  await editor.fill('20')
  await editor.press('Enter')
  await expect(editor).toHaveCount(0)
  await select(page, 'A93:F93')
  await stats(page, 4, '56', '14')
  await extrema(page, 6, '-4', '40')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await select(page, 'A93:F93')
  await stats(page, 4, '26', '6.5')
  await extrema(page, 6, '-4', '20')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await select(page, 'A93:F93')
  await stats(page, 4, '56', '14')
  await extrema(page, 6, '-4', '40')
  // E95 是分列种子；空区域语义仍用六个明确空白的末行单元格验证。
  await select(page, 'A100:F100')
  for (let col = 0; col < 6; col += 1) {
    await expect(page.locator(`td[data-cell="99:${col}"]`)).toHaveText('')
  }
  await stats(page, 0, '—', '—')
  await extrema(page, 0, '—', '—')
  await select(page, 'E93:F93')
  await stats(page, 0, '—', '—')
  await extrema(page, 2, '—', '—')
})

test('empty strings and errors count as content, but clearing a minimum removes it from extrema', async ({ page }) => {
  await summary(page)
  await select(page, 'A94:C94')
  await stats(page, 0, '—', '—')
  await extrema(page, 3, '—', '—')
  await expect(page.locator('td[data-cell="93:2"]')).toHaveText('#DIV/0!')
  await select(page, 'C93')
  await page.keyboard.press('Delete')
  await expect(page.locator('td[data-cell="92:2"]')).toHaveText('')
  await select(page, 'A93:F93')
  await extrema(page, 5, '0', '20')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await select(page, 'A93:F93')
  await extrema(page, 6, '-4', '20')
})

test('an entire column includes offscreen formulas and scrolling keeps the same statistics', async ({ page }) => {
  await summary(page)
  await select(page, 'D62')
  const randomValue = Number(await page.locator('td[data-cell="61:3"]').textContent())
  expect(randomValue).toBeGreaterThanOrEqual(0)
  expect(randomValue).toBeLessThan(1)
  await select(page, 'D75:D79')
  for (const [offset, value] of [-10, 0, 5, 10, 20].entries()) {
    await expect(page.locator(`td[data-cell="${74 + offset}:3"]`)).toHaveText(String(value))
  }
  await page.getByRole('columnheader', { name: 'Select column D', exact: true }).click()
  // 原五个数值合计 36；D75:D79 的色阶样例另有五个、合计 25。
  // 新的 D61 标题和 D62 RAND 也参加统计；滚动不能使随机公式意外重算。
  await expect(status(page)).toContainText('Numerical count: 11')
  await expect(status(page)).not.toContainText('Calculating selection')
  for (const [name, expected] of [['Sum', 61 + randomValue], ['Average', (61 + randomValue) / 11]] as const) {
    const text = await status(page).getByRole('button', { name: `Copy ${name}`, exact: true }).textContent()
    expect(Number(text!.slice(name.length + 2))).toBeCloseTo(expected, 8)
  }
  await extrema(page, 20, '-10', '20')
  const before = await status(page).textContent()
  await page.getByTestId('sheet-scroll').evaluate((element) => { element.scrollTop = element.scrollHeight })
  await expect(page.locator('td[data-cell="92:3"]')).toBeVisible()
  await expect(page.locator('td[data-cell="92:3"]')).toHaveText('20')
  await expect(status(page)).toHaveText(before!)
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await select(page, 'G2')
  // 投影完成不代表异步统计完成；先等原生 G2 总额，不能捕获前一个 D 列的保留结果。
  await stats(page, 1, '79', '79')
  const total = await status(page).textContent()
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'B1')
  await expect(status(page)).toHaveText(total!)
})

for (const width of [1440, 1280, 390]) {
  test(`statistics fit ${width}px without covering cells or overflowing`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 800 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await summary(page)
    await stats(page, 4, '26', '6.5')
    await extrema(page, 6, '-4', '20')
    // 可见不等于可点击：统计变长也不能把标签压到相邻操作按钮下面。
    for (const name of ['Sales Orders', 'Summary']) {
      const tab = page.getByRole('tab', { name, exact: true })
      await tab.click()
      await expect(tab).toHaveAttribute('aria-selected', 'true')
    }
    await select(page, 'A93:F93')
    await stats(page, 4, '26', '6.5')
    const tabs = page.locator('.sheet-tab-list')
    expect(await tabs.evaluate((element) => element.clientWidth)).toBeGreaterThanOrEqual(192)
    const footer = page.locator('.workbook-footer')
    expect(await footer.evaluate((element) =>
      element.scrollWidth <= element.clientWidth)).toBe(true)
    for (const span of await status(page).locator('button').all()) {
      await expect(span).toBeInViewport()
      expect(await span.evaluate((element) =>
        parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(11)
    }
    const box = await footer.boundingBox()
    const grid = await page.getByTestId('sheet-scroll').boundingBox()
    expect(grid!.y + grid!.height).toBeLessThanOrEqual(box!.y + 1)
    await page.screenshot({ path: info.outputPath(`selection-statistics-${width}.png`) })
    expect(errors).toEqual([])
  })
}

test('narrow statistics reserve their height while the real Worker result is pending', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await page.addInitScript(() => {
    // 只延迟原生统计请求，不伪造结果；稳定覆盖等待态与真实六项数值之间的布局切换。
    const post = Worker.prototype.postMessage
    const pending: Array<() => void> = []
    Object.defineProperty(window, 'releaseStatistics', {
      value: () => pending.splice(0).forEach((send) => send()),
    })
    Worker.prototype.postMessage = function (
      message: { command?: string }, options?: Transferable[] | StructuredSerializeOptions,
    ) {
      const send = () => post.call(this, message,
        Array.isArray(options) ? { transfer: options } : options ?? {})
      if (message.command === 'selection.aggregate') pending.push(send)
      else send()
    }
  })
  await summary(page)
  await expect(status(page)).toContainText('Calculating selection')
  const grid = page.getByTestId('sheet-scroll')
  const before = (await grid.boundingBox())!
  await page.evaluate(() => Reflect.get(window, 'releaseStatistics')())
  await stats(page, 4, '26', '6.5')
  expect((await grid.boundingBox())!.height).toBe(before.height)
  for (const button of await status(page).getByRole('button').all()) {
    await expect(button).toBeInViewport()
  }
})
