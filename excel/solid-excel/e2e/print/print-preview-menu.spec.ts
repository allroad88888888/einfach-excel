import { expect, test, type Page } from '@playwright/test'

import { expectNoConsoleErrors, guardConsoleErrors, withEnglishLocale } from '../helpers'

type WorkerScenario = {
  readonly navigationTestId: string
  readonly gridTestId: string
  readonly overlayTestId: string
}

function scenarioFor(projectName: string): WorkerScenario {
  return projectName === 'ts'
    ? {
        navigationTestId: 'nav-tab-vnext-worker-ts',
        gridTestId: 'vnext-worker-ts-grid',
        overlayTestId: 'vnext-worker-ts-print-preview',
      }
    : {
        navigationTestId: 'nav-tab-vnext-worker',
        gridTestId: 'vnext-worker-grid',
        overlayTestId: 'vnext-worker-print-preview',
      }
}

async function gotoWorkerDemo(page: Page): Promise<WorkerScenario> {
  const scenario = scenarioFor(test.info().project.name)
  await page.goto(withEnglishLocale())
  await page.getByTestId(scenario.navigationTestId).click()
  await expect(page.getByTestId(scenario.gridTestId)).toBeVisible({ timeout: 30_000 })
  expect(new URL(page.url()).searchParams.get('backend')).toBe(test.info().project.name)
  return scenario
}

async function openPrintPreview(page: Page, overlayTestId: string) {
  const fileMenu = page.getByTestId('menu-bar-button-file')
  await fileMenu.click()

  const printPreview = page.getByTestId('menu-bar-item-file.printPreview')
  await expect(printPreview).toBeVisible()
  await printPreview.click()

  const overlay = page.getByTestId(overlayTestId)
  await expect(overlay).toBeVisible()
  await expect(overlay).toHaveAttribute('role', 'dialog')
  await expect(overlay).toHaveAttribute('aria-label', 'Print preview')
  await expect(overlay.getByTestId('dialog-close-x')).toBeFocused()
  await expect(overlay.getByTestId('print-orientation-text')).toHaveText(/^(portrait|landscape)$/)
  await expect(overlay.getByTestId('print-scale-text')).toHaveText(/.+/)
  await expect(overlay.getByTestId('print-page-breaks-count')).toHaveText(/^\d+$/)
  return { fileMenu, overlay }
}

test.describe('worker print preview from the File menu', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('File > Print Preview opens a semantic dialog and restores File focus after Escape or Close', async ({
    page,
  }) => {
    const scenario = await gotoWorkerDemo(page)
    const escaped = await openPrintPreview(page, scenario.overlayTestId)

    await page.keyboard.press('Escape')
    await expect(escaped.overlay).toHaveCount(0)
    await expect(escaped.fileMenu).toBeFocused()

    const closed = await openPrintPreview(page, scenario.overlayTestId)
    await closed.overlay.getByTestId('print-close-button').click()
    await expect(closed.overlay).toHaveCount(0)
    await expect(closed.fileMenu).toBeFocused()
  })
})
