import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

import { expectNoConsoleErrors, guardConsoleErrors, withEnglishLocale } from '../helpers'

const PRINT_PREVIEW_CSS_URL = new URL(
  '../../../spreadsheet-ui-styles/features/print-preview-dialog.css',
  import.meta.url,
)

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
  await expect(overlay.getByTestId('print-orientation-text')).toHaveText(/^(Portrait|Landscape)$/)
  await expect(overlay.getByTestId('print-scale-text')).toHaveText(/.+/)
  await expect(overlay.getByTestId('print-page-breaks-count')).toHaveText(/^\d+$/)
  return { fileMenu, overlay }
}

async function previewMetrics(page: Page, overlayTestId: string, theme: 'light' | 'dark') {
  return page.getByTestId(overlayTestId).evaluate((overlay, nextTheme) => {
    const host = overlay.closest<HTMLElement>('.vnext-demo, .demo-page')!
    if (nextTheme === 'dark') host.dataset.spreadsheetTheme = 'dark'
    else delete host.dataset.spreadsheetTheme

    const resolveColor = (token: string) => {
      const sample = document.createElement('span')
      sample.style.backgroundColor = `var(${token})`
      overlay.append(sample)
      const color = getComputedStyle(sample).backgroundColor
      sample.remove()
      return color
    }
    const style = (selector: string) =>
      getComputedStyle(overlay.querySelector<HTMLElement>(selector)!)
    const height = (selector: string) =>
      overlay.querySelector<HTMLElement>(selector)!.getBoundingClientRect().height

    return {
      bodyBackground: style('.print-preview-dialog-body').backgroundColor,
      controlHeights: ['print-action-button', 'print-close-button', 'print-page-setup-button'].map(
        (testId) => height(`[data-testid="${testId}"]`),
      ),
      footerJustify: style('.print-preview-actions').justifyContent,
      headerHeight: height('.print-preview-dialog-header'),
      paperBackground: style('.print-preview-paper').backgroundColor,
      paperBorder: style('.print-preview-paper').borderColor,
      primaryBackground: style('[data-testid="print-action-button"]').backgroundColor,
      tokens: {
        body: resolveColor('--bg-chrome-light'),
        border: resolveColor('--border-strong'),
        primary: resolveColor('--dialog-primary-bg'),
        surface: resolveColor('--bg-surface'),
      },
    }
  }, theme)
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

  test('Print Preview keeps the Office web preview frame in light and dark themes', async ({
    page,
  }) => {
    const scenario = await gotoWorkerDemo(page)
    await openPrintPreview(page, scenario.overlayTestId)

    const light = await previewMetrics(page, scenario.overlayTestId, 'light')
    const dark = await previewMetrics(page, scenario.overlayTestId, 'dark')
    for (const metrics of [light, dark]) {
      expect(metrics.bodyBackground).toBe(metrics.tokens.body)
      expect(metrics.controlHeights).toEqual([28, 28, 28])
      expect(metrics.footerJustify).toBe('flex-end')
      expect(metrics.headerHeight).toBe(40)
      expect(metrics.paperBackground).toBe(metrics.tokens.surface)
      expect(metrics.paperBorder).toBe(metrics.tokens.border)
      expect(metrics.primaryBackground).toBe(metrics.tokens.primary)
    }
    expect(dark.bodyBackground).not.toBe(light.bodyBackground)
    expect(dark.paperBackground).not.toBe(light.paperBackground)
  })

  test('Print Preview feature CSS contains no literal colors', async () => {
    const source = (await readFile(PRINT_PREVIEW_CSS_URL, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '')
    expect(source.match(/#[\da-f]{3,8}\b|(?:rgb|hsl)a?\(/gi) ?? []).toEqual([])
  })
})
