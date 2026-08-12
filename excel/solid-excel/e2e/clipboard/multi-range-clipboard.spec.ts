import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import {
  cell,
  cellDisplay,
  expectNoConsoleErrors,
  grantClipboard,
  guardConsoleErrors,
  withEnglishLocale,
} from '../helpers'

const MULTI_REGION_ERROR =
  'Copying multiple selection regions is not supported. Select one region and try again.'

async function gotoWave5(page: Page, context: BrowserContext) {
  await grantClipboard(context)
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cellDisplay(page, 'B2')).toHaveText('120')
}

async function pressClipboardShortcut(page: Page, key: 'c' | 'x') {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${modifier}+${key}`)
}

async function writeClipboardSentinel(page: Page) {
  await page.evaluate(() => navigator.clipboard.writeText('existing system clipboard'))
}

async function expectClipboardSentinel(page: Page) {
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('existing system clipboard')
}

async function mergeB2C3(page: Page) {
  await cell(page, 'B2').click()
  await cell(page, 'C3').click({ modifiers: ['Shift'] })
  await page.getByTestId('toolbar-btn-merge').click()
  await page.getByTestId('toolbar-merge-center').click()
  await expect(cell(page, 'B2')).toHaveAttribute('data-merge-anchor', 'true')
  await expect(cell(page, 'B2')).toHaveAttribute('rowspan', '2')
  await expect(cell(page, 'B2')).toHaveAttribute('colspan', '2')
}

test.describe('clipboard — multi-region safe degradation', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('copy keeps the system clipboard and both disjoint regions intact', async ({
    page,
    context,
  }) => {
    await gotoWave5(page, context)
    await writeClipboardSentinel(page)

    await cell(page, 'B2').click()
    await cell(page, 'E5').click({ modifiers: ['ControlOrMeta'] })
    await expect(cell(page, 'B2')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'E5')).toHaveAttribute('data-active', 'true')

    await pressClipboardShortcut(page, 'c')

    await expect(page.getByTestId('status-last-command')).toHaveText(MULTI_REGION_ERROR)
    await expectClipboardSentinel(page)
    await expect(cell(page, 'B2')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'E5')).toHaveAttribute('data-selected', 'true')
  })

  test('cut rejects a merged primary region without clearing its anchor', async ({
    page,
    context,
  }) => {
    await gotoWave5(page, context)
    await mergeB2C3(page)
    await writeClipboardSentinel(page)

    await cell(page, 'E5').click()
    await cell(page, 'B2').click({ modifiers: ['ControlOrMeta'] })
    await expect(cell(page, 'E5')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'B2')).toHaveAttribute('data-active', 'true')

    await pressClipboardShortcut(page, 'x')

    await expect(page.getByTestId('status-last-command')).toHaveText(MULTI_REGION_ERROR)
    await expectClipboardSentinel(page)
    await expect(cellDisplay(page, 'B2')).toHaveText('120')
    await expect(cell(page, 'B2')).toHaveAttribute('data-merge-anchor', 'true')
    await expect(cell(page, 'E5')).toHaveAttribute('data-selected', 'true')
  })
})
