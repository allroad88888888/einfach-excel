import { expect, test, type Locator, type Page } from '@playwright/test'
import { select } from '../support/clipboard'
import { bar, button, cell, configure, edit, start, validationDialog } from './support'

async function expectReadableFeedback(message: Locator) {
  await expect(message).toBeVisible()
  const bounds = await message.evaluate(node => {
    const rect = node.getBoundingClientRect()
    return { width: rect.width, height: rect.height, left: rect.left, top: rect.top,
      right: rect.right, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight,
      fits: node.scrollWidth <= node.clientWidth }
  })
  expect(bounds.width).toBeGreaterThanOrEqual(240)
  expect(bounds.height).toBeLessThan(180)
  expect(bounds.left).toBeGreaterThanOrEqual(0)
  expect(bounds.top).toBeGreaterThanOrEqual(0)
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth)
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight)
  expect(bounds.fits).toBe(true)
}

async function scrollWithFeedback(page: Page, messages: readonly Locator[], screenshotPath: string) {
  const scroll = page.getByTestId('sheet-scroll')
  const before = await scroll.evaluate(node => ({ top: node.scrollTop, left: node.scrollLeft,
    width: node.scrollWidth, height: node.scrollHeight }))
  await scroll.evaluate(node => node.scrollBy(64, 120))
  await expect.poll(() => scroll.evaluate(node => node.scrollTop)).toBeGreaterThan(before.top)
  for (const message of messages) await expectReadableFeedback(message)
  expect(await scroll.evaluate(node => ({ width: node.scrollWidth, height: node.scrollHeight })))
    .toEqual({ width: before.width, height: before.height })
  await page.screenshot({ path: screenshotPath })
  await scroll.evaluate((node, position) => node.scrollTo(position.left, position.top), before)
  await expect.poll(() => scroll.evaluate(node => node.scrollTop)).toBe(before.top)
}

for (const width of [1280, 390]) test.describe(`${width}px advanced validation`, () => {
  test.use({ viewport: { width, height: 850 } })
  test.beforeEach(async ({ page }) => { await start(page) })

  test(`create custom formula validation relative to the selected range at ${width}px`, async ({ page }) => {
    await configure(page)
    await edit(page, 'D45', '44:3', '2'); await expect(cell(page, '44:3')).toHaveText('2')
    await edit(page, 'D46', '45:3', '3'); await expect(cell(page, '45:3')).toHaveText('3')
    await select(page, 'D46', '45:3'); await button(page, 'Data validation').click()
    await expect(page.getByLabel('Validation formula')).toHaveValue('=D45>0')
    await button(page, 'Cancel').click()
    await expect(cell(page, '44:4')).toHaveText('')
    await button(page, 'Undo').click(); await expect(cell(page, '45:3')).toHaveText('')
    await expect(cell(page, '44:3')).toHaveText('2')
  })

  test(`show input message on cell selection without native history at ${width}px`, async ({ page }, info) => {
    await configure(page, { prompt: true })
    await select(page, 'E45', '44:4')
    await expect(page.getByLabel('Validation input message')).toHaveCount(0)
    await select(page, 'D45', '44:3')
    const message = page.getByLabel('Validation input message')
    await expect(message).toContainText('Quantity')
    await expect(message).toContainText('请输入正数。')
    await expectReadableFeedback(message)
    await scrollWithFeedback(page, [message], info.outputPath(`validation-input-scrolled-${width}.png`))
    await page.screenshot({ path: info.outputPath(`validation-input-message-${width}.png`) })
    await button(page, 'Undo').click()
    await expect(message).toHaveCount(0)
    await expect(button(page, 'Undo')).toBeDisabled()
    await expect(cell(page, '44:3')).toHaveText('')
    await expect(cell(page, '45:3')).toHaveText('')
  })

  test(`Stop rejects invalid native input with the configured error message at ${width}px`, async ({ page }, info) => {
    await configure(page, { prompt: true })
    await edit(page, 'D45', '44:3', '-1')
    await expect(page.getByText('Enter a positive quantity.', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0)
    await expect(cell(page, '44:3')).toHaveText('')
    await expect(bar(page)).toHaveValue('-1')
    const message = page.getByLabel('Validation input message')
    const stop = page.getByRole('status', { name: 'Check quantity', exact: true })
    await expectReadableFeedback(message)
    await expectReadableFeedback(stop)
    const inputBounds = await message.boundingBox()
    const stopBounds = await stop.boundingBox()
    expect(inputBounds!.y + inputBounds!.height).toBeLessThanOrEqual(stopBounds!.y)
    await scrollWithFeedback(page, [message, stop], info.outputPath(`validation-stop-scrolled-${width}.png`))
    await page.screenshot({ path: info.outputPath(`validation-stop-message-${width}.png`) })
    await bar(page).press('Escape')
    await button(page, 'Undo').click()
    await expect(button(page, 'Undo')).toBeDisabled()
    await expect(cell(page, '45:3')).toHaveText('')
  })

  test(`cancel custom validation changes preserves the prior native rule and focus at ${width}px`, async ({ page }) => {
    await configure(page)
    await button(page, 'Data validation').click()
    await page.getByLabel('Validation formula').fill('=FALSE')
    await page.getByLabel('Error alert', { exact: true }).selectOption('information')
    await button(page, 'Cancel').click()
    await expect(button(page, 'Data validation')).toBeFocused()
    await button(page, 'Data validation').click()
    await expect(page.getByLabel('Validation formula')).toHaveValue('=D45>0')
    await expect(page.getByLabel('Error alert', { exact: true })).toHaveValue('stop')
    await button(page, 'Cancel').click(); await button(page, 'Undo').click()
    await expect(button(page, 'Undo')).toBeDisabled()
  })

  test(`clear advanced validation and undo restores its formula and messages at ${width}px`, async ({ page }) => {
    await configure(page, { prompt: true, style: 'warning' })
    await button(page, 'Data validation').click(); await button(page, 'Clear validation').click()
    await expect(validationDialog(page)).toHaveCount(0)
    await expect(page.getByLabel('Validation input message')).toHaveCount(0)
    await button(page, 'Undo').click()
    await expect(page.getByLabel('Validation input message')).toContainText('Quantity')
    await button(page, 'Data validation').click()
    await expect(page.getByLabel('Validation formula')).toHaveValue('=D45>0')
    await expect(page.getByLabel('Error alert', { exact: true })).toHaveValue('warning')
    await button(page, 'Cancel').click(); await button(page, 'Redo').click()
    await expect(page.getByLabel('Validation input message')).toHaveCount(0)
    await expect(cell(page, '44:3')).toHaveText('')
  })
})
