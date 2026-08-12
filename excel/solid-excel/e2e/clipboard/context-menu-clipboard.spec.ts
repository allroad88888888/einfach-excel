import { expect, test, type BrowserContext, type Page } from '@playwright/test'

import {
  expectNoConsoleErrors,
  grantClipboard,
  guardConsoleErrors,
  withEnglishLocale,
} from '../helpers'

/** Exercises Wave 5 context-menu clipboard calls at the real browser boundary. */

const WAVE5_GRID = '[data-testid="wave5-grid"]'
const CONTEXT_MENU = '[data-testid="wave5-context-menu"]'

function cell(page: Page, addr: string) {
  return page.locator(`${WAVE5_GRID} td.cell[data-cell-addr="${addr}"]`)
}

function display(page: Page, addr: string) {
  return cell(page, addr).locator('.cell-display')
}

async function gotoWave5(page: Page, context: BrowserContext) {
  await grantClipboard(context)
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await expect(display(page, 'B2')).toHaveText('120')

  const backend = test.info().project.name
  expect(['wasm', 'ts']).toContain(backend)
  expect(new URL(page.url()).searchParams.get('backend')).toBe(backend)
}

async function runContextMenuCommand(
  page: Page,
  addr: string,
  command: 'clipboard.copy' | 'clipboard.cut' | 'clipboard.paste',
) {
  await cell(page, addr).click({ button: 'right' })
  await expect(page.locator(CONTEXT_MENU)).toBeVisible()
  await page.getByTestId(`context-menu-command-${command}`).click()
  await expect(page.locator(CONTEXT_MENU)).toHaveCount(0)
}

async function clipboardText(page: Page) {
  return page.evaluate(() => navigator.clipboard.readText())
}

test.describe('Wave 5 context-menu clipboard browser boundary', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('right-click Copy writes the browser Clipboard and Paste reads it into the target', async ({
    page,
    context,
  }) => {
    await gotoWave5(page, context)

    await runContextMenuCommand(page, 'B2', 'clipboard.copy')
    await expect(await clipboardText(page)).toContain('# einfach-clipboard-origin: B2\n120')

    await runContextMenuCommand(page, 'D2', 'clipboard.paste')
    await expect(display(page, 'D2')).toHaveText('120')
  })

  test('right-click Cut writes the browser Clipboard before it clears the source', async ({
    page,
    context,
  }) => {
    await gotoWave5(page, context)

    await runContextMenuCommand(page, 'B2', 'clipboard.cut')

    await expect(await clipboardText(page)).toContain('# einfach-clipboard-origin: B2\n120')
    await expect(display(page, 'B2')).toHaveText('')
  })

  test('denied browser Clipboard read leaves a right-click Paste target unchanged', async ({
    page,
    context,
  }) => {
    await gotoWave5(page, context)
    await page.evaluate(() => navigator.clipboard.writeText('must not reach the worksheet'))
    await context.clearPermissions()

    const readWasDenied = await page.evaluate(async () => {
      try {
        await navigator.clipboard.readText()
        return false
      } catch {
        return true
      }
    })
    expect(readWasDenied).toBe(true)

    await runContextMenuCommand(page, 'G2', 'clipboard.paste')
    await expect(display(page, 'G2')).toHaveText('')
  })
})
