import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const handle = (page: Page) => page.getByRole('button', { name: 'Drag to fill', exact: true })
const name = (page: Page) => page.getByRole('textbox', { name: 'Name box' })
async function select(page: Page, address: string) {
  await name(page).fill(address)
  await name(page).press('Enter')
  await expect(name(page)).toHaveValue(address)
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-projection-retained', 'false')
}
async function begin(page: Page, address: string) {
  await select(page, address)
  await expect(handle(page)).toBeVisible()
  await handle(page).hover()
  await page.mouse.down()
}
async function move(page: Page, coord: string) {
  const box = await cell(page, coord).boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 5 })
  await expect(page.getByTestId('fill-preview')).toBeVisible()
}
async function finish(page: Page, range: string) {
  await page.mouse.up()
  await expect(name(page)).toHaveValue(range)
  await expect(page.getByTestId('fill-preview')).toHaveCount(0)
  await expect(page.getByLabel('Fill status')).toContainText('Filled')
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
})

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return
  await info.attach('fill-handle-layout', { contentType: 'application/json',
    body: JSON.stringify(await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>('.fill-handle')
      const scroll = document.querySelector('.sheet-scroll')
      return { button: button?.outerHTML, scrollTop: scroll?.scrollTop, scrollLeft: scroll?.scrollLeft,
        frame: document.querySelector('[data-workbook-grid]')?.getAttribute('style') }
    }), null, 2) })
})

test('number seed previews without writing then extends, undoes and redoes', async ({ page }) => {
  await begin(page, 'A40:A41')
  await move(page, '44:0')
  await expect(cell(page, '44:0')).toHaveText('')
  await expect(name(page)).toHaveValue('A40:A41')
  await finish(page, 'A40:A45')
  await expect(cell(page, '44:0')).toHaveText('11')
  await expect(cell(page, '39:0')).toHaveText('1')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '44:0')).toHaveText('')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(cell(page, '44:0')).toHaveText('11')
})

test('text numbering keeps padded labels and italic source style', async ({ page }) => {
  await begin(page, 'C40:C41')
  await move(page, '43:2')
  await finish(page, 'C40:C44')
  await expect(cell(page, '43:2')).toHaveText('Item009')
  await expect(cell(page, '43:2')).toHaveCSS('font-style', 'italic')
})

test('clicking the handle without dragging does not fill the adjacent cell', async ({ page }) => {
  await begin(page, 'A40:A41')
  await page.mouse.up()
  await expect(name(page)).toHaveValue('A40:A41')
  await expect(cell(page, '41:0')).toHaveText('')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

test('horizontal decimals extend in both directions from the same native samples', async ({ page }) => {
  for (const [address, value] of [['C50', '0.25'], ['D50', '0.75']]) {
    await select(page, address!)
    const input = page.getByRole('textbox', { name: 'Active cell value' })
    await input.fill(value!)
    await input.press('Enter')
  }
  await begin(page, 'C50:D50')
  await move(page, '49:5')
  await finish(page, 'C50:F50')
  await expect(cell(page, '49:5')).toHaveText('1.75')
  await begin(page, 'C50:D50')
  await move(page, '49:0')
  await finish(page, 'A50:D50')
  await expect(cell(page, '49:0')).toHaveText('-0.75')
})

for (const modifier of ['Control', 'Meta']) {
  test(`${modifier} pressed during drag switches number series to tiled copy`, async ({ page }) => {
    await begin(page, 'A40:A41')
    await move(page, '43:0')
    await page.keyboard.down(modifier)
    await expect(handle(page)).toHaveAttribute('data-mode', 'copy')
    await finish(page, 'A40:A44')
    await page.keyboard.up(modifier)
    await expect(cell(page, '41:0')).toHaveText('1')
    await expect(cell(page, '42:0')).toHaveText('3')
    await expect(cell(page, '43:0')).toHaveText('1')
  })
}

test('upwards drag extends numbers before the source', async ({ page }) => {
  await select(page, 'A40:A41')
  const scroll = page.getByTestId('sheet-scroll')
  await scroll.evaluate((el) => { el.scrollTop -= 200 })
  await expect(cell(page, '37:0')).toBeInViewport()
  await handle(page).hover()
  await page.mouse.down()
  await move(page, '37:0')
  await finish(page, 'A38:A41')
  await expect(cell(page, '37:0')).toHaveText('-3')
  await expect(cell(page, '38:0')).toHaveText('-1')
  await expect(cell(page, '39:0')).toHaveText('1')
})

test('left and right drag copy text with underline and leave source intact', async ({ page }) => {
  await begin(page, 'D71')
  await move(page, '70:5')
  await finish(page, 'D71:F71')
  await expect(cell(page, '70:5')).toHaveText('Fill me')
  await expect(cell(page, '70:5')).toHaveCSS('text-decoration-line', 'underline')
  await begin(page, 'D71')
  await move(page, '70:2')
  await finish(page, 'C71:D71')
  await expect(cell(page, '70:2')).toHaveText('Fill me')
  await expect(cell(page, '70:3')).toHaveText('Fill me')
})

test('formula fill uses native relative references and one undo', async ({ page }) => {
  await begin(page, 'B71')
  await move(page, '72:1')
  await finish(page, 'B71:B73')
  await expect(cell(page, '72:1')).toHaveText('6')
  await select(page, 'B73')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=(A73+$A$71)')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '72:1')).toHaveText('')
})

test('Escape and pointer cancellation do not change values or allocate history', async ({ page }) => {
  await begin(page, 'A40:A41')
  await move(page, '43:0')
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(page.getByTestId('fill-preview')).toHaveCount(0)
  await expect(name(page)).toHaveValue('A40:A41')
  await expect(cell(page, '43:0')).toHaveText('')
  await begin(page, 'A40:A41')
  await move(page, '43:0')
  await handle(page).dispatchEvent('pointercancel', { pointerId: 1 })
  await page.mouse.up()
  await expect(cell(page, '43:0')).toHaveText('')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

test('merged target rejects atomically and retains source selection for retry', async ({ page }) => {
  await begin(page, 'A13')
  await move(page, '15:0')
  await page.mouse.up()
  await expect(page.getByLabel('Fill status')).toContainText('unmerge cells')
  await expect(name(page)).toHaveValue('A13')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await begin(page, 'A40:A41')
  await move(page, '43:0')
  await finish(page, 'A40:A44')
})

test('frozen row source has one handle and can fill into the scrolling body', async ({ page }) => {
  await begin(page, 'A1')
  await expect(handle(page)).toHaveCount(1)
  await move(page, '2:0')
  await finish(page, 'A1:A3')
  await expect(cell(page, '2:0')).toHaveText('First order total')
  await expect(cell(page, '2:0')).toHaveCSS('font-weight', '700')
})

test('holding at bottom autoscrolls without further pointer moves', async ({ page }) => {
  await begin(page, 'C40:C41')
  const scroll = page.getByTestId('sheet-scroll')
  const bounds = await scroll.boundingBox()
  const source = await cell(page, '40:2').boundingBox()
  const before = await scroll.evaluate((el) => el.scrollTop)
  await page.mouse.move(source!.x + source!.width / 2, bounds!.y + bounds!.height - 4)
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(before + 120)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

test('holding at right edge scrolls horizontally and releases into an offscreen column', async ({ page }) => {
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await begin(page, 'B3')
  const copied = await cell(page, '2:1').textContent()
  const scroll = page.getByTestId('sheet-scroll')
  const bounds = await scroll.boundingBox()
  const source = await cell(page, '2:1').boundingBox()
  const before = await scroll.evaluate((el) => el.scrollLeft)
  await page.mouse.move(bounds!.x + bounds!.width - 4, source!.y + source!.height / 2)
  await expect.poll(() => scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before + 120)
  await page.mouse.up()
  await expect(page.getByLabel('Fill status')).toContainText('Filled right')
  await expect(name(page)).toHaveValue(/^B3:[A-Z]+3$/)
  // 不跳转／不触发额外投影，松手后的当前窗口必须已经显示 Rust 写入结果。
  await expect(page.locator('td[data-selected="true"][data-cell^="2:"]').last()).toHaveText(copied!)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await select(page, 'C3')
  await expect(cell(page, '2:2')).toHaveText('East')
})

test('top and left edges keep scrolling backwards while the handle holds capture', async ({ page }) => {
  await begin(page, 'C40:C41')
  const scroll = page.getByTestId('sheet-scroll')
  let bounds = await scroll.boundingBox()
  const source = await cell(page, '40:2').boundingBox()
  const top = await scroll.evaluate((el) => el.scrollTop)
  await page.mouse.move(source!.x + source!.width / 2, bounds!.y + 4)
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeLessThan(top - 120)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await begin(page, 'P3')
  bounds = await scroll.boundingBox()
  const end = await cell(page, '2:15').boundingBox()
  const left = await scroll.evaluate((el) => el.scrollLeft)
  expect(left).toBeGreaterThan(120)
  await page.mouse.move(bounds!.x + 4, end!.y + end!.height / 2)
  await expect.poll(() => scroll.evaluate((el) => el.scrollLeft)).toBeLessThan(left - 120)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

for (const width of [1280, 390]) {
  test(`fill handle preview is visible and clipped at ${width}px`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.setViewportSize({ width, height: 800 })
    await begin(page, 'A40:A41')
    await expect(handle(page)).toBeInViewport()
    await move(page, '43:0')
    await expect(page.getByTestId('fill-preview')).toBeInViewport()
    await page.screenshot({ path: info.outputPath(`fill-handle-${width}.png`) })
    await finish(page, 'A40:A44')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
}
