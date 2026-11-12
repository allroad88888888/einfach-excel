import { expect, type Page } from '@playwright/test'
import { dateButton as button, openDateRules } from './conditional-dates'

export const stateMatches = {
  blank: [0, 1, 2, 3],
  'not-blank': [5, 6, 7, 8, 9, 11],
  error: [4, 10],
  'not-error': [0, 1, 2, 3, 5, 6, 7, 8, 9, 11],
} as const
export type StateCondition = keyof typeof stateMatches
export const stateCoord = (index: number) => `${34 + Math.floor(index / 3)}:${index % 3}`

export async function addStateRule(page: Page, range: string, condition: StateCondition,
  fill = '#00ff00') {
  await openDateRules(page)
  await page.getByLabel('Applies to', { exact: true }).fill(range)
  await page.getByLabel('Rule type').selectOption('cell-state')
  await page.getByLabel('Cell condition').selectOption(condition)
  await page.getByLabel('Highlight fill', { exact: true }).fill(fill)
  await button(page, 'Add rule').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
