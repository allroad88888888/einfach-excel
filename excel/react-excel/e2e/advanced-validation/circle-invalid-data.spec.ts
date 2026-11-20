import { expect, test } from '@playwright/test'
import { openDateFile } from '../support/conditional-dates'
import { button, cell, go } from '../support/date-filter'
import { showRibbonItem } from '../support/ribbon'

function makeFixture(options: { protectedSheet?: boolean } = {}) {
  return Buffer.from(
    JSON.stringify({
      format: 'einfach-workbook',
      version: 1,
      title: 'Validation circles',
      canvases: [{ rowCount: 30, colCount: 8 }],
      workbook: {
        version: 1,
        sheets: [{ idx: 0, name: 'Audit' }],
        cells: [
          { sheet: 0, row: 0, col: 0, addr: 'A1', kind: 'text', value: 'Score' },
          { sheet: 0, row: 0, col: 1, addr: 'B1', kind: 'text', value: 'Limit' },
          { sheet: 0, row: 0, col: 2, addr: 'C1', kind: 'text', value: 'Status' },
          { sheet: 0, row: 1, col: 0, addr: 'A2', kind: 'number', value: 10 },
          { sheet: 0, row: 2, col: 0, addr: 'A3', kind: 'number', value: 30 },
          { sheet: 0, row: 1, col: 1, addr: 'B2', kind: 'number', value: 20 },
          { sheet: 0, row: 2, col: 1, addr: 'B3', kind: 'number', value: 20 },
          { sheet: 0, row: 1, col: 2, addr: 'C2', kind: 'text', value: 'Open' },
          { sheet: 0, row: 2, col: 2, addr: 'C3', kind: 'text', value: 'Stale' },
        ],
        dataValidations: [
          {
            sheet: 0,
            regions: [
              {
                range: [1, 0, 10, 0],
                rule: {
                  kind: 'whole-number',
                  operator: 'between',
                  min: 1,
                  max: 20,
                  ignoreBlank: false,
                },
              },
              {
                range: [1, 2, 5, 2],
                rule: {
                  kind: 'list',
                  items: ['Open', 'Closed'],
                  ignoreBlank: true,
                },
              },
            ],
          },
        ],
        ...(options.protectedSheet
          ? {
              protections: [
                { sheet: 0, protection: { mode: 'protected', unlockedRanges: [] } },
              ],
            }
          : {}),
      },
    }),
  )
}

test('Circle invalid data highlights pre-existing violations, updates on edit, and clears', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto('/?locale=en')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openDateFile(page, makeFixture())
  await expect(cell(page, '0:0')).toHaveText('Score')

  await showRibbonItem(page, 'data.validation-circles')
  await button(page, 'Circle invalid data').click()

  // A3 (2:0 = 30 > 20) and C3 (2:2 = 'Stale') are circled; valid and blank cells are not
  await expect(page.locator('[data-validation-circle="2:0"]')).toHaveCount(1)
  await expect(page.locator('[data-validation-circle="2:2"]')).toHaveCount(1)
  await expect(page.locator('[data-validation-circle]')).toHaveCount(2)
  await expect(button(page, 'Undo')).toBeDisabled()

  // Fix A3 from 30 to 15 -> circle disappears automatically
  await go(page, 'A3')
  await page.keyboard.type('15')
  await page.keyboard.press('Enter')
  await expect(cell(page, '2:0')).toHaveText('15')
  await expect(page.locator('[data-validation-circle="2:0"]')).toHaveCount(0)
  await expect(page.locator('[data-validation-circle="2:2"]')).toHaveCount(1)

  // Clear all validation circles
  await showRibbonItem(page, 'data.validation-circles')
  await button(page, 'Clear validation circles').click()
  await expect(page.locator('[data-validation-circle]')).toHaveCount(0)
})

test('Circle invalid data tracks dynamic custom formula rules in DOM and Canvas renderers', async ({
  page,
}) => {
  const customFixture = Buffer.from(
    JSON.stringify({
      format: 'einfach-workbook',
      version: 1,
      title: 'Custom formula circles',
      canvases: [{ rowCount: 30, colCount: 8 }],
      workbook: {
        version: 1,
        sheets: [{ idx: 0, name: 'Audit' }],
        cells: [
          { sheet: 0, row: 0, col: 0, addr: 'A1', kind: 'text', value: 'Score' },
          { sheet: 0, row: 0, col: 1, addr: 'B1', kind: 'text', value: 'Limit' },
          { sheet: 0, row: 1, col: 0, addr: 'A2', kind: 'number', value: 10 },
          { sheet: 0, row: 2, col: 0, addr: 'A3', kind: 'number', value: 30 },
          { sheet: 0, row: 1, col: 1, addr: 'B2', kind: 'number', value: 20 },
          { sheet: 0, row: 2, col: 1, addr: 'B3', kind: 'number', value: 20 },
        ],
        dataValidations: [
          {
            sheet: 0,
            regions: [
              {
                range: [1, 0, 2, 0],
                rule: {
                  kind: 'custom-formula',
                  formula: '=A2<=B2',
                  anchor: { row: 1, col: 0 },
                  ignoreBlank: true,
                },
              },
            ],
          },
        ],
      },
    }),
  )

  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto('/?renderer=canvas&locale=en')
  await openDateFile(page, customFixture)
  await showRibbonItem(page, 'data.validation-circles')
  await button(page, 'Circle invalid data').click()

  // A3 (30 > 20) circled; A2 (10 <= 20) not circled
  await expect(page.locator('[data-validation-circle="2:0"]')).toHaveCount(1)
  await expect(page.locator('[data-validation-circle="1:0"]')).toHaveCount(0)

  // Raise B3 to 50 -> A3 becomes valid and loses its circle
  await go(page, 'B3')
  await page.keyboard.type('50')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-validation-circle="2:0"]')).toHaveCount(0)

  // Lower B2 to 5 -> A2 becomes invalid and gains a circle
  await go(page, 'B2')
  await page.keyboard.type('5')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-validation-circle="1:0"]')).toHaveCount(1)
})

test('Circle invalid data works on a protected worksheet without mutating undo history', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto('/?locale=en')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openDateFile(page, makeFixture({ protectedSheet: true }))
  await expect(cell(page, '0:0')).toHaveText('Score')

  await showRibbonItem(page, 'data.validation-circles')
  await button(page, 'Circle invalid data').click()
  await expect(page.locator('[data-validation-circle="2:0"]')).toHaveCount(1)
  await expect(page.locator('[data-validation-circle="2:2"]')).toHaveCount(1)
  await expect(button(page, 'Undo')).toBeDisabled()

  await button(page, 'Clear validation circles').click()
  await expect(page.locator('[data-validation-circle]')).toHaveCount(0)
  await expect(button(page, 'Undo')).toBeDisabled()
})
