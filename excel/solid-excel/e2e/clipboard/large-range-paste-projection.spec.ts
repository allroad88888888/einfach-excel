import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import {
  expectNoConsoleErrors,
  grantClipboard,
  guardConsoleErrors,
  withEnglishLocale,
} from '../helpers'

type WorkerScenario = {
  readonly navigationTestId: string
  readonly gridTestId: string
}

function scenarioFor(projectName: string): WorkerScenario {
  return projectName === 'ts'
    ? { navigationTestId: 'nav-tab-vnext-worker-ts', gridTestId: 'vnext-worker-ts-grid' }
    : { navigationTestId: 'nav-tab-vnext-worker', gridTestId: 'vnext-worker-grid' }
}

function cell(page: Page, gridTestId: string, addr: string) {
  return page.locator(`[data-testid="${gridTestId}"] td.cell[data-cell-addr="${addr}"]`)
}

function display(page: Page, gridTestId: string, addr: string) {
  return cell(page, gridTestId, addr).locator('.cell-display')
}

async function gotoWorkerGrid(page: Page, context: BrowserContext): Promise<WorkerScenario> {
  const scenario = scenarioFor(test.info().project.name)
  await grantClipboard(context)
  await page.goto(withEnglishLocale())
  await page.getByTestId(scenario.navigationTestId).click()
  await expect(page.getByTestId(scenario.gridTestId)).toBeVisible({ timeout: 30_000 })
  return scenario
}

async function navigateViaNameBox(page: Page, gridTestId: string, addr: string) {
  const input = page.getByTestId('name-box-input')
  await input.click()
  await input.fill(addr)
  await input.press('Enter')
  await expect(page.getByTestId('status-selection')).toHaveText(addr)
  await expect(cell(page, gridTestId, addr)).toBeVisible()
}

async function selectRangeViaNameBox(page: Page, range: string) {
  const input = page.getByTestId('name-box-input')
  await input.click()
  await input.fill(range)
  await input.press('Enter')
}

async function enterValue(page: Page, gridTestId: string, addr: string, value: string) {
  await navigateViaNameBox(page, gridTestId, addr)
  await cell(page, gridTestId, addr).dblclick()
  const input = cell(page, gridTestId, addr).locator('.cell-input')
  await expect(input).toBeVisible()
  await input.fill(value)
  await input.press('Enter')
  await expect(display(page, gridTestId, addr)).toHaveText(value)
}

async function pressClipboardKey(page: Page, key: 'c' | 'v') {
  const meta = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${meta}+${key}`)
}

function expectBackendProject(page: Page) {
  const project = test.info().project.name
  expect(['wasm', 'ts']).toContain(project)
  expect(new URL(page.url()).searchParams.get('backend')).toBe(project)
}

test.describe('large range copy/paste projection', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('copying B2:E8 to G2 exposes every target corner through the name box', async ({
    page,
    context,
  }) => {
    const scenario = await gotoWorkerGrid(page, context)
    expectBackendProject(page)

    await enterValue(page, scenario.gridTestId, 'B2', '101')
    await enterValue(page, scenario.gridTestId, 'E2', '102')
    await enterValue(page, scenario.gridTestId, 'B8', '103')
    await enterValue(page, scenario.gridTestId, 'E8', '104')

    await selectRangeViaNameBox(page, 'B2:E8')
    await expect(cell(page, scenario.gridTestId, 'B2')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, scenario.gridTestId, 'E8')).toHaveAttribute('data-selected', 'true')
    await pressClipboardKey(page, 'c')

    await navigateViaNameBox(page, scenario.gridTestId, 'G2')
    await pressClipboardKey(page, 'v')

    await expect(display(page, scenario.gridTestId, 'G2')).toHaveText('101')
    await navigateViaNameBox(page, scenario.gridTestId, 'J2')
    await expect(display(page, scenario.gridTestId, 'J2')).toHaveText('102')
    await navigateViaNameBox(page, scenario.gridTestId, 'G8')
    await expect(display(page, scenario.gridTestId, 'G8')).toHaveText('103')
    await navigateViaNameBox(page, scenario.gridTestId, 'J8')
    await expect(display(page, scenario.gridTestId, 'J8')).toHaveText('104')
  })
})
