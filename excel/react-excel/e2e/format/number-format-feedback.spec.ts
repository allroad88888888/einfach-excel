import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

test('native rejection retains number settings, fits 390px and retries as one history entry', async ({ page }, info) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage
    let rejectOnce = true
    Worker.prototype.postMessage = function (
      message: { command?: string; payload?: { request: { sheetId: string } } },
      options?: Transferable[] | StructuredSerializeOptions,
    ) {
      if (rejectOnce && message.command === 'format.setRange' && message.payload) {
        rejectOnce = false
        message = { ...message, payload: {
          ...message.payload, request: { ...message.payload.request, sheetId: 'missing-format-sheet' },
        } }
      }
      post.call(this, message, Array.isArray(options) ? { transfer: options } : (options ?? {}))
    }
  })
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto('/')
  const target = await select(page, 'F3', '2:5')
  await page.getByRole('button', { name: 'Number format settings' }).click()
  await page.getByLabel('Number format category').selectOption('currency')
  await page.getByLabel('Currency symbol').fill('USD ')
  await page.getByRole('spinbutton', { name: 'Decimal places', exact: true }).fill('3')
  await page.getByRole('button', { name: 'Apply number format' }).click()
  await expect(page.getByRole('alert')).toContainText('Check the cells before retrying')
  await expect(page.getByLabel('Currency symbol')).toHaveValue('USD ')
  await expect(page.getByRole('spinbutton', { name: 'Decimal places', exact: true })).toHaveValue('3')
  await expect(target).toHaveText('329')
  const rect = (await page.getByRole('alert').boundingBox())!
  expect(rect.x).toBeGreaterThanOrEqual(0)
  expect(rect.x + rect.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: info.outputPath('number-format-error-390.png') })
  await page.getByRole('button', { name: 'Apply number format' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(target).toHaveText('USD 329.000')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(target).toHaveText('329')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

test('pending format blocks duplicate apply, draft edits and cancellation until Rust responds', async ({ page }) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage
    let release = () => {}
    Object.defineProperty(window, 'releaseNumberFormat', { value: () => release() })
    Worker.prototype.postMessage = function (
      message: { command?: string }, options?: Transferable[] | StructuredSerializeOptions,
    ) {
      const send = () => post.call(this, message,
        Array.isArray(options) ? { transfer: options } : (options ?? {}))
      if (message.command === 'format.setRange') release = send
      else send()
    }
  })
  await page.goto('/')
  const target = await select(page, 'F3', '2:5')
  const opener = page.getByRole('button', { name: 'Number format settings' })
  await opener.click()
  await page.getByRole('spinbutton', { name: 'Decimal places', exact: true }).fill('3')
  await page.getByRole('button', { name: 'Apply number format' }).click()
  await expect(page.getByRole('spinbutton', { name: 'Decimal places', exact: true })).toBeDisabled()
  await expect(page.getByLabel('Number format category')).toBeDisabled()
  await expect(page.getByLabel('Use thousands separator')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Apply number format' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
  await expect(page.getByRole('status').filter({ hasText: 'Applying number format' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.evaluate(() => Reflect.get(window, 'releaseNumberFormat')())
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(opener).toBeFocused()
  await expect(target).toHaveText('329.000')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(target).toHaveText('329')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})
