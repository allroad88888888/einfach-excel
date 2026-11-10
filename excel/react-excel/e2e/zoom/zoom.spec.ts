import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const scroll = (page: Page) => page.getByTestId('sheet-scroll')
const zoomGroup = (page: Page) => page.getByRole('group', { name: 'Zoom' })
const nameBox = (page: Page) => page.getByRole('textbox', { name: 'Name box' })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const center = async (page: Page, coord: string) => {
  const box = (await cell(page, coord).boundingBox())!
  return [box.x + box.width / 2, box.y + box.height / 2] as const
}
async function screenHeight(page: Page, coord: string) {
  return (await cell(page, coord).boundingBox())!.height
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('zoom in and out buttons step the grid by 10 percent', async ({ page }) => {
  const base = await screenHeight(page, '3:0')
  const zoomIn = zoomGroup(page).getByRole('button', { name: 'Zoom in' })
  for (let step = 0; step < 5; step++) await zoomIn.click()
  await expect(scroll(page)).toHaveAttribute('data-zoom', '150')
  await expect(zoomGroup(page)).toContainText('150%')
  await expect.poll(() => screenHeight(page, '3:0')).toBeCloseTo(base * 1.5, 0)
  // 网格内仍是逻辑像素：同一格的布局高度不随缩放变。
  await expect(cell(page, '3:0')).toHaveJSProperty('offsetHeight', Math.round(base))
  await zoomGroup(page).getByRole('button', { name: 'Zoom out' }).click()
  await expect(scroll(page)).toHaveAttribute('data-zoom', '140')
})

test('zoom slider sets an exact zoom level', async ({ page }) => {
  await zoomGroup(page).getByRole('slider', { name: 'Zoom level' }).fill('60')
  await expect(scroll(page)).toHaveAttribute('data-zoom', '60')
  await expect(zoomGroup(page)).toContainText('60%')
  // 缩小后同一视口装下更多行，投影窗口随之扩大。
  await expect(cell(page, '40:0')).toBeVisible()
})

test('clicking the zoom percentage resets the sheet to 100 percent', async ({ page }) => {
  await zoomGroup(page).getByRole('slider', { name: 'Zoom level' }).fill('200')
  await expect(scroll(page)).toHaveAttribute('data-zoom', '200')
  await zoomGroup(page).getByRole('button', { name: /Zoom 200 percent/ }).click()
  await expect(scroll(page)).toHaveAttribute('data-zoom', '100')
  await expect(scroll(page)).not.toHaveAttribute('style', /zoom/)
})

test('ctrl wheel over the grid zooms the sheet without zooming the page', async ({ page }) => {
  await page.mouse.move(...await center(page, '4:2'))
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -100)
  await expect(scroll(page)).toHaveAttribute('data-zoom', '110')
  await page.mouse.wheel(0, 100)
  await page.mouse.wheel(0, 100)
  await page.keyboard.up('Control')
  await expect(scroll(page)).toHaveAttribute('data-zoom', '90')
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1)
})

test('pointer selection, fill drag and column resize hit the cells under the pointer at 150 percent',
  async ({ page }) => {
    // 720px 高时 150% 下 F10 落在可视区底边以下，拖选会触发边缘自动滚动，
    // 输入稍慢就多滚一行成 F11；1000px 高让拖拽终点留在可视区且避开 48px 边缘区。
    await page.setViewportSize({ width: 1280, height: 1000 })
    await zoomGroup(page).getByRole('slider', { name: 'Zoom level' }).fill('150')
    await expect(scroll(page)).toHaveAttribute('data-zoom', '150')

    await page.mouse.move(...await center(page, '2:1'))
    await page.mouse.down()
    await page.mouse.move(...await center(page, '9:5'), { steps: 8 })
    await page.mouse.up()
    await expect(nameBox(page)).toHaveValue('B3:F10')

    await select(page, 'B3', '2:1')
    await expect(cell(page, '2:1')).toHaveText('Northwind')
    const handle = (await page.getByRole('button', { name: 'Drag to fill' }).boundingBox())!
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(...await center(page, '4:1'), { steps: 8 })
    await page.mouse.up()
    await expect(cell(page, '3:1')).toHaveText('Northwind')
    await expect(cell(page, '4:1')).toHaveText('Northwind')
    await expect(cell(page, '5:1')).not.toHaveText('Northwind')

    const before = await cell(page, '0:2').evaluate((element) => (element as HTMLElement).offsetWidth)
    const resize = (await page.getByRole('separator', { name: 'Resize column C', exact: true }).boundingBox())!
    await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2)
    await page.mouse.down()
    await page.mouse.move(resize.x + resize.width / 2 + 45, resize.y + resize.height / 2, { steps: 5 })
    await page.mouse.up()
    // 屏幕上拖 45px，在 150% 下等于逻辑列宽加 30px。
    await expect.poll(() => cell(page, '0:2').evaluate((element) => (element as HTMLElement).offsetWidth))
      .toBe(before + 30)
  })

test('each sheet keeps its own zoom level', async ({ page }) => {
  await zoomGroup(page).getByRole('slider', { name: 'Zoom level' }).fill('130')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(scroll(page)).toHaveAttribute('data-zoom', '100')
  await zoomGroup(page).getByRole('button', { name: 'Zoom out' }).click()
  await expect(scroll(page)).toHaveAttribute('data-zoom', '90')
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await expect(scroll(page)).toHaveAttribute('data-zoom', '130')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})
