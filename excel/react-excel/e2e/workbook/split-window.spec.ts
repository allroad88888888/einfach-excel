import { expect, test, type Page } from '@playwright/test'
import { showRibbonItem } from '../support/ribbon'

const splitMenu = (page: Page) => page.getByRole('combobox', { name: 'Split window' })
const freezeMenu = (page: Page) => page.getByRole('combobox', { name: 'Freeze panes' })
const formulaInput = (page: Page) =>
  page.getByRole('textbox', { name: 'Active cell value', exact: true })

async function selectAddress(page: Page, address: string) {
  const box = page.getByRole('textbox', { name: 'Name box', exact: true })
  await box.fill(address)
  await box.press('Enter')
  await expect(box).toHaveValue(address)
}

test('SPLIT-001: horizontal split scrolls independently and keeps edits live across panes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  const primary = page.getByTestId('sheet-scroll')
  await expect(primary.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')

  await showRibbonItem(page, 'view.split-window')
  await splitMenu(page).selectOption('horizontal')
  const grid = page.locator('.split-viewport-grid')
  await expect(grid).toHaveAttribute('data-split-mode', 'horizontal')
  const bottom = page.locator('[data-split-pane="bottom"]')
  await expect(bottom).toBeVisible()

  // Scroll bottom pane far down while top pane stays at row 1
  await bottom.evaluate((node) => {
    node.scrollTop = 1800
  })
  await expect.poll(() => primary.evaluate((node) => node.scrollTop)).toBe(0)
  await expect(primary.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
  const distantCell = bottom.locator('td[data-cell="70:0"]')
  await expect(distantCell).toBeVisible()
  const originalText = (await distantCell.textContent()) ?? ''
  expect(originalText).toMatch(/^SO-\d+$/)

  // Clicking a distant cell in the bottom pane populates the formula bar without moving top pane
  await distantCell.click()
  await expect(page.getByRole('textbox', { name: 'Name box', exact: true })).toHaveValue('A71')
  await expect(formulaInput(page)).toHaveValue(originalText)
  await expect.poll(() => primary.evaluate((node) => node.scrollTop)).toBe(0)

  // Editing via formula bar updates the bottom pane live and Undo restores it
  await formulaInput(page).fill('SO-SPLIT-71')
  await formulaInput(page).press('Enter')
  await expect(distantCell).toHaveText('SO-SPLIT-71')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(distantCell).toHaveText(originalText)

  // Double-clicking a cell inside the bottom pane opens in-cell CellEditor without scrolling top pane
  await distantCell.dblclick()
  const bottomEditor = bottom.getByRole('textbox', { name: 'Cell editor', exact: true })
  await expect(bottomEditor).toBeVisible()
  await bottomEditor.fill('SO-INCELL-71')
  await bottomEditor.press('Enter')
  await expect(distantCell).toHaveText('SO-INCELL-71')
  await expect.poll(() => primary.evaluate((node) => node.scrollTop)).toBe(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(distantCell).toHaveText(originalText)

  // Scrolling bottom back to top shows live edits made from the top pane
  await bottom.evaluate((node) => {
    node.scrollTop = 0
  })
  await expect(bottom.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
  await primary.locator('td[data-cell="1:0"]').click()
  await formulaInput(page).fill('SO-TOP-EDIT')
  await formulaInput(page).press('Enter')
  await expect(primary.locator('td[data-cell="1:0"]')).toHaveText('SO-TOP-EDIT')
  await expect(bottom.locator('td[data-cell="1:0"]')).toHaveText('SO-TOP-EDIT')
})

test('SPLIT-002: quad split couples scroll axes, supports divider double-click, and excludes freeze', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  const primary = page.getByTestId('sheet-scroll')
  await expect(primary.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')

  await selectAddress(page, 'C6')
  await showRibbonItem(page, 'view.split-window')
  await splitMenu(page).selectOption('selection')
  const grid = page.locator('.split-viewport-grid')
  await expect(grid).toHaveAttribute('data-split-mode', 'quad')
  const topRight = page.locator('[data-split-pane="top-right"]')
  const bottomLeft = page.locator('[data-split-pane="bottom-left"]')
  const bottomRight = page.locator('[data-split-pane="bottom-right"]')
  await expect(topRight).toBeVisible()
  await expect(bottomLeft).toBeVisible()
  await expect(bottomRight).toBeVisible()

  // Scrolling bottom-right couples vertically with bottom-left and horizontally with top-right
  const primaryBefore = await primary.evaluate((node) => ({
    top: node.scrollTop,
    left: node.scrollLeft,
  }))
  await bottomRight.evaluate((node) => {
    node.scrollTop = 640
    node.scrollLeft = 240
  })
  await expect.poll(() => bottomLeft.evaluate((node) => node.scrollTop)).toBeGreaterThan(500)
  await expect.poll(() => topRight.evaluate((node) => node.scrollLeft)).toBeGreaterThan(180)
  expect(await primary.evaluate((node) => node.scrollTop)).toBe(primaryBefore.top)
  expect(await primary.evaluate((node) => node.scrollLeft)).toBe(primaryBefore.left)

  // Double-clicking vertical divider removes vertical split while keeping horizontal split
  await page.locator('[data-split-divider="vertical"]').dblclick()
  await expect(grid).toHaveAttribute('data-split-mode', 'horizontal')
  await expect(topRight).toHaveCount(0)

  // Freezing top row automatically clears the split window
  await showRibbonItem(page, 'view.freeze-panes')
  await freezeMenu(page).selectOption('first-row')
  await expect(grid).toHaveAttribute('data-split-mode', 'none')
  await expect(page.locator('[data-frozen-pane="top"]')).toBeVisible()

  // Splitting vertically automatically unfreezes the sheet
  await showRibbonItem(page, 'view.split-window')
  await splitMenu(page).selectOption('vertical')
  await expect(grid).toHaveAttribute('data-split-mode', 'vertical')
  await expect(page.locator('[data-frozen-pane="top"]')).toHaveCount(0)
})

test('SPLIT-003: split window renders in Canvas mode and stays isolated per sheet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto('/?locale=en&renderer=canvas')
  const primaryCanvas = page.getByTestId('sheet-scroll').locator('canvas').first()
  await expect(primaryCanvas).toBeVisible()

  await showRibbonItem(page, 'view.split-window')
  await splitMenu(page).selectOption('horizontal')
  const grid = page.locator('.split-viewport-grid')
  await expect(grid).toHaveAttribute('data-split-mode', 'horizontal')

  const splitCanvas = page.locator('[data-split-pane="bottom"] canvas').first()
  await expect(splitCanvas).toBeVisible()
  await expect
    .poll(() => splitCanvas.evaluate((node) => Number(node.dataset.paintedCells ?? '0')))
    .toBeGreaterThan(0)

  // Switching sheets isolates split state per sheet
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(grid).toHaveAttribute('data-split-mode', 'none')
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await expect(grid).toHaveAttribute('data-split-mode', 'horizontal')

  // Remove split via ribbon control
  await showRibbonItem(page, 'view.split-window')
  await splitMenu(page).selectOption('clear')
  await expect(grid).toHaveAttribute('data-split-mode', 'none')
})
