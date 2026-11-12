import { expect, test } from '@playwright/test'

test('Canvas displays Special using Rust output without truncating long phone numbers', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: string[] = []
    Reflect.set(window, 'specialPaint', calls)
    const original = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      calls.push(text)
      if (calls.length > 10000) calls.splice(0, 5000)
      if (maxWidth === undefined) original.call(this, text, x, y)
      else original.call(this, text, x, y, maxWidth)
    }
  })
  await page.goto('/?renderer=canvas')
  await expect(page.locator('[data-workbook-grid] canvas')).toBeVisible()
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill('C23')
  await name.press('Enter')
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'specialPaint'))).toContain('(212) 555-1234')
  const input = page.getByRole('textbox', { name: 'Active cell value' })
  await input.fill('1234567890123')
  await input.press('Enter')
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'specialPaint'))).toContain('(123456) 789-0123')
  await expect(input).toHaveValue('1234567890123')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(input).toHaveValue('2125551234')
})
