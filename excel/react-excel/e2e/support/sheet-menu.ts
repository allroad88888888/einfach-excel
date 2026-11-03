import { expect, type Page } from '@playwright/test'

/** Uses the actual sheet context menu for commands formerly exposed beside the tabs. */
export async function sheetMenuItem(page: Page, name: string) {
  const active = page.getByRole('tablist', { name: 'Workbook sheets' })
    .getByRole('tab', { selected: true })
  await active.click({ button: 'right' })
  const menu = page.getByRole('menu', { name: 'Worksheet tab', exact: true })
  await expect(menu).toBeVisible()
  return menu.getByRole('menuitem', { name, exact: true })
}
