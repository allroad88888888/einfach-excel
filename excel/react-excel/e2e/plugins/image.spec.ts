import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

// 2×1 红色 PNG：浏览器能解码出尺寸，Rust 按文件头识别类型。
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP4z8DAwMAAAA0BAf8MNHMXAAAAAElFTkSuQmCC', 'base64')
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const images = (page: Page) => page.locator('.drawing-frame[data-drawing-kind="image"]')

async function open(page: Page) {
  await page.goto('/?plugins=image')
  await expect(page.locator('td[data-cell="1:0"]')).toBeVisible()
  await page.locator('td[data-cell="2:1"]').click()
}

test('inserting a picture from a file stores it in the workbook and survives save and reopen', async ({ page }) => {
  await open(page)
  await page.getByTestId('plugin-image-file').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG })
  await expect(images(page)).toHaveCount(1)
  const picture = images(page).locator('img.plugin-image')
  await expect(picture).toHaveAttribute('src', /^blob:/)
  await expect(picture).toHaveAttribute('alt', 'logo')
  await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2)
  await button(page, 'Undo').click()
  await expect(images(page)).toHaveCount(0)
  await button(page, 'Redo').click()
  await expect(images(page)).toHaveCount(1)

  await button(page, 'File').click()
  const downloading = page.waitForEvent('download')
  await button(page, 'Download workbook').click()
  const text = await readFile((await (await downloading).path())!, 'utf8')
  const book = JSON.parse(text).workbook
  const drawing = book.drawings[0].drawings[0]
  expect(drawing).toMatchObject({ kind: 'image', anchor: { row: 2, col: 1 } })
  expect(book.media).toEqual([{ id: drawing.media, mime: 'image/png', data: PNG.toString('base64') }])
  await button(page, 'Close').click()

  await page.goto('/?plugins=image')
  await button(page, 'File').click()
  page.once('dialog', (prompt) => prompt.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({
    name: 'Pictures.einfach.json', mimeType: 'application/json', buffer: Buffer.from(text) })
  await expect(images(page).locator('img.plugin-image')).toHaveAttribute('src', /^blob:/)
})

test('inserting a picture by address stores only the address and rejects other schemes', async ({ page }) => {
  await page.route('https://pictures.test/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: PNG }))
  await open(page)
  await button(page, 'Insert picture from address').click()
  const address = page.getByLabel('Picture address', { exact: true })
  await address.fill('javascript:alert(1)')
  await button(page, 'Insert').click()
  await expect(page.getByRole('alert')).toContainText('http or https')
  await address.fill('https://pictures.test/a.png')
  await button(page, 'Insert').click()
  await expect(images(page).locator('img')).toHaveAttribute('src', 'https://pictures.test/a.png')
})
