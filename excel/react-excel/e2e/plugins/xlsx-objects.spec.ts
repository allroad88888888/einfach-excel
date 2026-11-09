import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP4z8DAwMAAAA0BAf8MNHMXAAAAAElFTkSuQmCC', 'base64')
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const files = (page: Page) => page.getByRole('dialog', { name: 'Workbook files' })

test('pictures and sparklines survive downloading as Excel and opening the file again', async ({ page }) => {
  await page.goto('/?plugins=image,sparkline')
  await expect(cell(page, '1:0')).toBeVisible()
  await button(page, 'New sheet').click()
  await cell(page, '0:0').click()
  for (const value of ['1', '3', '2']) {
    await page.keyboard.type(value)
    await page.keyboard.press('Tab')
  }
  await page.keyboard.press('Enter')
  await cell(page, '0:0').click()
  await cell(page, '0:2').click({ modifiers: ['Shift'] })
  await button(page, 'Create sparklines: Column').click()
  await page.getByLabel('Location range').fill('E1')
  await button(page, 'OK').click()
  await expect(page.locator('.drawing-cell[data-drawing-kind="sparkline"] rect')).toHaveCount(3)
  await cell(page, '3:1').click()
  await page.getByTestId('plugin-image-file').setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.locator('.drawing-frame[data-drawing-kind="image"] img')).toHaveAttribute('src', /^blob:/)

  await button(page, 'File').click()
  const download = page.waitForEvent('download')
  await files(page).getByRole('button', { name: 'Download as Excel (.xlsx)' }).click()
  const buffer = await readFile((await (await download).path())!)
  await expect(files(page).getByRole('status')).not.toContainText('sparklines')
  await expect(files(page).getByRole('status')).not.toContainText('images or drawings')
  await page.keyboard.press('Escape')

  await page.goto('/?plugins=image,sparkline')
  await button(page, 'File').click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({ name: 'Objects.xlsx', mimeType: XLSX, buffer })
  await expect(files(page)).toHaveCount(0)
  // 对象在新建的工作表上（演示簿已有四张表，新表名为 Sheet5）。
  await page.getByRole('tab', { name: 'Sheet5', exact: true }).click()
  await expect(page.locator('.drawing-frame[data-drawing-kind="image"] img')).toHaveAttribute('src', /^blob:/)
  await expect(page.locator('.drawing-cell[data-drawing-kind="sparkline"] rect')).toHaveCount(3)
})
