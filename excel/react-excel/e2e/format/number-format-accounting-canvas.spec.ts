import { expect, test } from '@playwright/test'

test('Canvas paints accounting symbols and bracketed values with the shared native layout', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    const calls: { text: string; align: string }[] = []
    Reflect.set(window, 'accountingPaint', calls)
    const original = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      calls.push({ text, align: this.textAlign })
      if (calls.length > 10000) calls.splice(0, 5000)
      if (maxWidth === undefined) original.call(this, text, x, y)
      else original.call(this, text, x, y, maxWidth)
    }
  })
  await page.goto('/?renderer=canvas')
  await expect(page.locator('[data-workbook-grid] canvas')).toBeVisible()
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill('A19:C19')
  await name.press('Enter')
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'accountingPaint')))
    .toEqual(expect.arrayContaining([
      { text: '$', align: 'left' }, { text: '(1,234.50)', align: 'right' },
    ]))
  await page.getByRole('button', { name: 'Increase decimal places', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'accountingPaint')))
    .toEqual(expect.arrayContaining([{ text: '(1,234.500)', align: 'right' }]))
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect(errors).toEqual([])
})
