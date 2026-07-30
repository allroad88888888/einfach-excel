import { test, expect, type Page } from '@playwright/test'
import {
  cell,
  cellDisplay,
  cellInput,
  expectDisplay,
  expectNoConsoleErrors,
  gotoDemo,
  guardConsoleErrors,
  typeIntoCell,
} from '../helpers'

/**
 * Representative in-demo edit chains beyond the plain number-bump the
 * per-demo smoke specs already cover: overwriting a formula cell with a
 * literal, feeding a non-numeric value into numeric aggregates, and
 * clearing a source cell. All assertions are user-visible cell text;
 * seed addresses come from `DemoBudget.tsx` / `DemoGrades.tsx` /
 * `DemoSales.tsx`.
 */

const META = process.platform === 'darwin' ? 'Meta' : 'Control'

async function pressUndo(page: Page) {
  await page.locator('.excel-table-wrapper').focus()
  await page.keyboard.press(`${META}+z`)
}

test.describe('Demo representative edit chains', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('Budget: literal over the C14 total recomputes dependents; undo restores the formula', async ({
    page,
  }) => {
    guardConsoleErrors(page)
    await gotoDemo(page, 'Budget')

    // C14 = SUM(C8..C13) = 7000 feeds D14 (= C14-B14) and C16 (= C5-C14).
    await expectDisplay(page, 'C14', '7000')
    await expectDisplay(page, 'D14', '-100')
    await expectDisplay(page, 'C16', '3500')

    // A user typing a literal over the total silently breaks the SUM —
    // dependents must recompute from the literal.
    await typeIntoCell(page, 'C14', '9000')
    await expectDisplay(page, 'C14', '9000')
    // D14 = 9000 - 7100 = 1900.
    await expectDisplay(page, 'D14', '1900')
    // C16 = 10500 - 9000 = 1500.
    await expectDisplay(page, 'C16', '1500')

    // One undo restores the formula RESULT and the dependents.
    await pressUndo(page)
    await expectDisplay(page, 'C14', '7000')
    await expectDisplay(page, 'D14', '-100')
    await expectDisplay(page, 'C16', '3500')

    // …and the formula SOURCE — the undo snapshot must bring back
    // `=SUM(...)`, not freeze 7000 in as a literal.
    await cell(page, 'C14').dblclick()
    const input = cellInput(page, 'C14')
    await expect(input).toBeVisible()
    expect(await input.inputValue()).toBe('=SUM(C8,C9,C10,C11,C12,C13)')
    await input.press('Escape')
    await expect(input).toHaveCount(0)
  })

  test('Grades: a non-numeric score drops out of COUNT / AVERAGE / MIN', async ({ page }) => {
    guardConsoleErrors(page)
    await gotoDemo(page, 'Grade Calc')

    await expectDisplay(page, 'B14', '8')
    await expectDisplay(page, 'B11', '79.125')
    await expectDisplay(page, 'B13', '45')

    // Frank was absent — his math score becomes text. Numeric aggregates
    // must skip the text cell (Excel semantics), not error out.
    await typeIntoCell(page, 'B7', 'absent')
    await expectDisplay(page, 'B7', 'absent')

    // COUNT drops to 7; class avg = (633-45)/7 = 84; MIN moves to Diana's
    // 63; MAX unaffected.
    await expectDisplay(page, 'B14', '7')
    await expectDisplay(page, 'B11', '84')
    await expectDisplay(page, 'B13', '63')
    await expectDisplay(page, 'B12', '100')

    // Frank's row stats skip the text too: AVG = (52+48)/2 = 50.
    await expectDisplay(page, 'E7', '50')
    await expectDisplay(page, 'F7', '52')
    await expectDisplay(page, 'G7', '48')

    // Undo restores the numeric score and every aggregate.
    await pressUndo(page)
    await expectDisplay(page, 'B7', '45')
    await expectDisplay(page, 'B14', '8')
    await expectDisplay(page, 'B11', '79.125')
    await expectDisplay(page, 'B13', '45')
  })

  test('Sales: clearing B4 removes it from every SUM; undo brings the number back', async ({
    page,
  }) => {
    guardConsoleErrors(page)
    await gotoDemo(page, 'Sales Dashboard')

    await expectDisplay(page, 'B4', '12000')
    await expectDisplay(page, 'E4', '25700')
    await expectDisplay(page, 'B8', '45000')

    // Commit an empty edit — the cell clears and the SUMs shrink.
    await typeIntoCell(page, 'B4', '')
    await expectDisplay(page, 'B4', '')
    // E4 = SUM(B4,C4,D4) = 8500 + 5200 = 13700.
    await expectDisplay(page, 'E4', '13700')
    // B8 = SUM(B4,B5,B6) = 15000 + 18000 = 33000.
    await expectDisplay(page, 'B8', '33000')
    // E8 = 13700 + 31000 + 36500 = 81200 and the revenue KPI follows.
    await expectDisplay(page, 'E8', '81200')
    await expectDisplay(page, 'H4', '81200')

    await pressUndo(page)
    await expectDisplay(page, 'B4', '12000')
    await expectDisplay(page, 'E4', '25700')
    await expectDisplay(page, 'B8', '45000')
    await expectDisplay(page, 'E8', '93200')
  })
})
