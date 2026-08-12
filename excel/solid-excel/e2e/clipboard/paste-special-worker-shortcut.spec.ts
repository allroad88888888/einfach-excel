import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { withEnglishLocale } from '../helpers'

type WorkerScenario = {
  readonly navigationTestId: string
  readonly gridTestId: string
  readonly dialogTestId: string
  readonly sourceValue: string
}

function scenarioFor(projectName: string): WorkerScenario {
  if (projectName === 'ts') {
    return {
      navigationTestId: 'nav-tab-vnext-worker-ts',
      gridTestId: 'vnext-worker-ts-grid',
      dialogTestId: 'vnext-worker-ts-paste-special',
      sourceValue: '30',
    }
  }

  return {
    navigationTestId: 'nav-tab-vnext-worker',
    gridTestId: 'vnext-worker-grid',
    dialogTestId: 'vnext-worker-paste-special',
    sourceValue: '10',
  }
}

function cell(page: Page, gridTestId: string, addr: string) {
  return page.locator(`[data-testid="${gridTestId}"] td.cell[data-cell-addr="${addr}"]`)
}

async function openWorkerGrid(page: Page, context: BrowserContext): Promise<WorkerScenario> {
  const scenario = scenarioFor(test.info().project.name)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(withEnglishLocale())
  await page.getByTestId(scenario.navigationTestId).click()
  await expect(page.getByTestId(scenario.gridTestId)).toBeVisible({ timeout: 30_000 })
  await expect(cell(page, scenario.gridTestId, 'B4').locator('.cell-display')).toHaveText(
    scenario.sourceValue,
  )
  return scenario
}

async function pressPrimaryKey(page: Page, key: 'c' | 'v') {
  const meta = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${meta}+${key}`)
}

async function pressPasteSpecial(page: Page) {
  const meta = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${meta}+Alt+v`)
}

test.describe('Paste Special shortcut on worker backends', () => {
  test('Ctrl/⌘+Alt+V opens the real dialog after an internal copy', async ({ page, context }) => {
    const scenario = await openWorkerGrid(page, context)

    await cell(page, scenario.gridTestId, 'B4').click()
    await expect(cell(page, scenario.gridTestId, 'B4')).toHaveAttribute('data-active', 'true')
    await pressPrimaryKey(page, 'c')

    await cell(page, scenario.gridTestId, 'D4').click()
    await expect(cell(page, scenario.gridTestId, 'D4')).toHaveAttribute('data-active', 'true')
    await pressPasteSpecial(page)

    await expect(page.getByTestId(scenario.dialogTestId)).toBeVisible()
  })
})
