import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)

async function selectCell(page: Page, address: string) {
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill(address)
  await name.press('Enter')
  await expect(name).toHaveValue(address)
}

async function writeViaFormulaBar(page: Page, address: string, value: string) {
  await selectCell(page, address)
  const bar = page.getByRole('textbox', { name: 'Active cell value' })
  await bar.fill(value)
  await bar.press('Enter')
}

test('TIMEIN-001: sub-second time inputs parse as day fractions, format milliseconds, and recalculate', async ({
  page,
}) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')

  // In-cell edit with sub-second 24h time
  await selectCell(page, 'K2')
  await cell(page, '1:10').dblclick()
  const inCellEditor = page.getByRole('textbox', { name: 'Cell editor' })
  await inCellEditor.fill('12:30:15.250')
  await inCellEditor.press('Enter')
  await expect(inCellEditor).toBeHidden()
  await expect(cell(page, '1:10')).toHaveText('12:30:15.250')

  // Formula bar edit with AM/PM sub-second time and elapsed >=24h sub-second time
  await writeViaFormulaBar(page, 'L2', '2:30:15.5 AM')
  await expect(cell(page, '1:11')).toHaveText('2:30:15.5 AM')
  await writeViaFormulaBar(page, 'O2', '25:30:00.125')
  await expect(cell(page, '1:14')).toHaveText('25:30:00.125')

  await writeViaFormulaBar(page, 'M2', '=ROUND(K2*86400000,0)')
  await expect(cell(page, '1:12')).toHaveText('45015250')

  await writeViaFormulaBar(page, 'N2', '=ROUND(L2*86400000,0)')
  await expect(cell(page, '1:13')).toHaveText('9015500')

  // Neighbor cell remains unaffected
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('TIMEIN-002: host dateInputOrder parses MDY and DMY slash dates while default YMD keeps ambiguous dates as text', async ({
  page,
}) => {
  // Default strict YMD: ambiguous slash date stays text
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await writeViaFormulaBar(page, 'K2', '03/04/2024')
  await writeViaFormulaBar(page, 'L2', '=ISTEXT(K2)')
  await expect(cell(page, '1:10')).toHaveText('03/04/2024')
  await expect(cell(page, '1:11')).toHaveText('TRUE')

  // Explicit MDY host configuration
  await page.goto('/?dateInputOrder=MDY')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await writeViaFormulaBar(page, 'K2', '03/04/2024')
  await writeViaFormulaBar(page, 'L2', '31/03/2024')
  await writeViaFormulaBar(page, 'M2', '=MONTH(K2)&"-"&DAY(K2)')
  await expect(cell(page, '1:10')).toHaveText('2024-03-04')
  await expect(cell(page, '1:11')).toHaveText('31/03/2024')
  await expect(cell(page, '1:12')).toHaveText('3-4')

  // Explicit DMY host configuration
  await page.goto('/?dateInputOrder=DMY')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await writeViaFormulaBar(page, 'K2', '03/04/2024')
  await writeViaFormulaBar(page, 'L2', '31/03/2024')
  await writeViaFormulaBar(page, 'M2', '=MONTH(K2)&"-"&DAY(K2)')
  await expect(cell(page, '1:10')).toHaveText('2024-04-03')
  await expect(cell(page, '1:11')).toHaveText('2024-03-31')
  await expect(cell(page, '1:12')).toHaveText('4-3')
})
