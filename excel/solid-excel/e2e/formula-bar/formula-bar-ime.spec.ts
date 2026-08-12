import { expect, test, type Page } from '@playwright/test'

import { expectNoConsoleErrors, guardConsoleErrors, withEnglishLocale } from '../helpers'

/** Verifies Formula Bar command keys stay owned by the browser during IME composition. */

const gridSelector = '[data-testid="wave5-grid"]'

function cell(page: Page, address: string) {
  return page.locator(`${gridSelector} td.cell[data-cell-addr="${address}"]`)
}

function cellDisplay(page: Page, address: string) {
  return cell(page, address).locator('.cell-display')
}

function cellInput(page: Page, address: string) {
  return cell(page, address).locator('.cell-input')
}

function formulaBar(page: Page) {
  return page.getByTestId('formula-bar-input')
}

async function gotoWave5(page: Page) {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cellDisplay(page, 'B2')).toHaveText('120')

  const backend = test.info().project.name
  expect(['wasm', 'ts']).toContain(backend)
  expect(new URL(page.url()).searchParams.get('backend')).toBe(backend)
}

async function dispatchComposition(page: Page, type: 'compositionstart' | 'compositionend') {
  await formulaBar(page).evaluate((node, eventType) => {
    node.dispatchEvent(new CompositionEvent(eventType, { bubbles: true, data: '汉' }))
  }, type)
}

async function dispatchComposingKey(page: Page, key: 'Enter' | 'Escape'): Promise<boolean> {
  return formulaBar(page).evaluate((node, composingKey) => {
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      isComposing: true,
      key: composingKey,
    })
    node.dispatchEvent(event)
    return event.defaultPrevented
  }, key)
}

test.describe('Formula Bar IME command boundary', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('composition keeps Enter and Escape in the browser, then final Enter commits', async ({
    page,
  }) => {
    await gotoWave5(page)
    await cell(page, 'H2').click()

    const bar = formulaBar(page)
    await bar.click()
    await bar.fill('ime-draft')
    await expect(bar).toHaveValue('ime-draft')
    await expect(cellInput(page, 'H2')).toHaveValue('ime-draft')

    await dispatchComposition(page, 'compositionstart')

    // While an IME owns the input, neither command is prevented, submitted,
    // nor allowed to cancel the live editing session.
    await expect(dispatchComposingKey(page, 'Enter')).resolves.toBe(false)
    await expect(cellInput(page, 'H2')).toHaveValue('ime-draft')
    await expect(bar).toBeFocused()

    await expect(dispatchComposingKey(page, 'Escape')).resolves.toBe(false)
    await expect(cellInput(page, 'H2')).toHaveValue('ime-draft')
    await expect(bar).toBeFocused()

    await dispatchComposition(page, 'compositionend')
    await bar.press('Enter')

    await expect(cellInput(page, 'H2')).toHaveCount(0)
    await expect(cellDisplay(page, 'H2')).toHaveText('ime-draft')
  })
})
