import { expect, test, type Page } from '@playwright/test'
import { showRibbonItem } from '../support/ribbon'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const specialDialog = (page: Page) => page.getByRole('dialog', { name: 'Go to special', exact: true })

async function selectRange(page: Page, address: string) {
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill(address)
  await name.press('Enter')
  await expect(name).toHaveValue(address)
}

async function writeFormulaBar(page: Page, address: string, value: string) {
  await selectRange(page, address)
  const bar = page.getByRole('textbox', { name: 'Active cell value' })
  await bar.fill(value)
  await bar.press('Enter')
}

async function openGoToSpecial(page: Page) {
  await showRibbonItem(page, 'view.go-to-special')
  await button(page, 'Go to special').click()
  await expect(specialDialog(page)).toBeVisible()
}

test('NAV-065: Go to special Objects selects the first floating object on Charts demo and reports empty sheets', async ({
  page,
}) => {
  // Sheet without floating objects keeps selection and reports feedback
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await selectRange(page, 'C3')
  await openGoToSpecial(page)
  await specialDialog(page).getByRole('button', { name: 'Objects', exact: true }).click()
  await expect(specialDialog(page).getByRole('alert')).toHaveText(
    'No floating objects found on this worksheet.',
  )
  await button(page, 'Cancel').click()
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('C3')

  // Charts demo has seeded floating chart objects: selects first object and reports count
  await page.goto('/?demo=charts')
  await expect(page.locator('.drawing-frame').first()).toBeVisible()
  await openGoToSpecial(page)
  await specialDialog(page).getByRole('button', { name: 'Objects', exact: true }).click()
  await expect(specialDialog(page)).toHaveCount(0)
  await expect(page.locator('.drawing-frame[data-selected="true"]')).toHaveCount(1)
  await expect(page.locator('[data-go-to-special-notice="true"]')).toContainText('floating object')
})

test('NAV-066: Go to special Conditional formats (same) selects only cells matching the active cell rule', async ({
  page,
}) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')

  // Add identical > 50 rule on K2:K3 and M2:M3, and a different > 999 rule on L2
  for (const addr of ['K2:K3', 'M2:M3']) {
    await selectRange(page, addr)
    await showRibbonItem(page, 'format.conditional-formatting')
    await button(page, 'Conditional formatting').click()
    const cf = page.getByRole('dialog', { name: 'Conditional formatting', exact: true })
    await cf.getByLabel('Value', { exact: true }).fill('50')
    await cf.getByRole('button', { name: 'Add rule', exact: true }).click()
    await expect(cf).toHaveCount(0)
  }
  await selectRange(page, 'L2')
  await showRibbonItem(page, 'format.conditional-formatting')
  await button(page, 'Conditional formatting').click()
  const cfOther = page.getByRole('dialog', { name: 'Conditional formatting', exact: true })
  await cfOther.getByLabel('Value', { exact: true }).fill('999')
  await cfOther.getByRole('button', { name: 'Add rule', exact: true }).click()
  await expect(cfOther).toHaveCount(0)

  await selectRange(page, 'K2')
  await openGoToSpecial(page)
  await specialDialog(page)
    .getByRole('button', { name: 'Conditional formats (same)', exact: true })
    .click()
  await expect(specialDialog(page)).toHaveCount(0)
  await expect(page.locator('[data-go-to-special-notice="true"]')).toContainText(
    'Selected 4 cells in 2 areas.',
  )
})

test('NAV-067: Go to special Data validation (same) selects only cells matching the active cell rule', async ({
  page,
}) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')

  // Apply Whole number 1..10 validation to K5:K6 and M5:M6, and List validation to L5
  for (const addr of ['K5:K6', 'M5:M6']) {
    await selectRange(page, addr)
    await showRibbonItem(page, 'data.data-validation')
    await button(page, 'Data validation').click()
    const dv = page.getByRole('dialog', { name: 'Data validation', exact: true })
    await dv.getByLabel('Allow', { exact: true }).selectOption('whole-number')
    await dv.getByLabel('Minimum', { exact: true }).fill('1')
    await dv.getByLabel('Maximum', { exact: true }).fill('10')
    await dv.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(dv).toHaveCount(0)
  }
  await selectRange(page, 'L5')
  await showRibbonItem(page, 'data.data-validation')
  await button(page, 'Data validation').click()
  const dvOther = page.getByRole('dialog', { name: 'Data validation', exact: true })
  await dvOther.getByLabel('Allow', { exact: true }).selectOption('list')
  await dvOther.getByLabel('Items, one per line').fill('Alpha\nBeta')
  await dvOther.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(dvOther).toHaveCount(0)

  await selectRange(page, 'K5')
  await openGoToSpecial(page)
  await specialDialog(page)
    .getByRole('button', { name: 'Data validation (same)', exact: true })
    .click()
  await expect(specialDialog(page)).toHaveCount(0)
  await expect(page.locator('[data-go-to-special-notice="true"]')).toContainText(
    'Selected 4 cells in 2 areas.',
  )
})

test('NAV-068: Go to special Precedents distinguishes direct-only from all-levels recursive precedents', async ({
  page,
}) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')

  await writeFormulaBar(page, 'K8', '10')
  await writeFormulaBar(page, 'L8', '=K8*2')
  await writeFormulaBar(page, 'M8', '=L8+5')
  await writeFormulaBar(page, 'N8', '=M8-1')

  await selectRange(page, 'N8')
  await openGoToSpecial(page)
  await specialDialog(page)
    .getByRole('button', { name: 'Precedents (direct only)', exact: true })
    .click()
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('M8')
  await expect(page.locator('[data-go-to-special-notice="true"]')).toContainText(
    'Selected 1 cells in 1 areas.',
  )

  await selectRange(page, 'N8')
  await openGoToSpecial(page)
  await specialDialog(page)
    .getByRole('button', { name: 'Precedents (all levels)', exact: true })
    .click()
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('K8:M8')
  await expect(page.locator('[data-go-to-special-notice="true"]')).toContainText(
    'Selected 3 cells in 1 areas.',
  )
})

test('NAV-069: Go to special Dependents distinguishes direct-only from all-levels recursive dependents', async ({
  page,
}) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')

  await writeFormulaBar(page, 'K10', '10')
  await writeFormulaBar(page, 'L10', '=K10*2')
  await writeFormulaBar(page, 'M10', '=L10+5')
  await writeFormulaBar(page, 'N10', '=M10-1')

  await selectRange(page, 'K10')
  await openGoToSpecial(page)
  await specialDialog(page)
    .getByRole('button', { name: 'Dependents (direct only)', exact: true })
    .click()
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('L10')
  await expect(page.locator('[data-go-to-special-notice="true"]')).toContainText(
    'Selected 1 cells in 1 areas.',
  )

  await selectRange(page, 'K10')
  await openGoToSpecial(page)
  await specialDialog(page)
    .getByRole('button', { name: 'Dependents (all levels)', exact: true })
    .click()
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('L10:N10')
  await expect(page.locator('[data-go-to-special-notice="true"]')).toContainText(
    'Selected 3 cells in 1 areas.',
  )
})
