import { expect, test } from '@playwright/test'
import { launch, boundaries, open, choose, apply, rows, go } from '../support/date-filter'

const periods = [
  ['today', 'TODAY()', 'TODAY()+1'],
  ['yesterday', 'TODAY()-1', 'TODAY()'],
  ['tomorrow', 'TODAY()+1', 'TODAY()+2'],
  ['last-week', 'TODAY()-WEEKDAY(TODAY(),1)-6', 'TODAY()-WEEKDAY(TODAY(),1)+1'],
  ['this-week', 'TODAY()-WEEKDAY(TODAY(),1)+1', 'TODAY()-WEEKDAY(TODAY(),1)+8'],
  ['next-week', 'TODAY()-WEEKDAY(TODAY(),1)+8', 'TODAY()-WEEKDAY(TODAY(),1)+15'],
  ['last-month', 'DATE(YEAR(TODAY()),MONTH(TODAY())-1,1)', 'DATE(YEAR(TODAY()),MONTH(TODAY()),1)'],
  ['this-month', 'DATE(YEAR(TODAY()),MONTH(TODAY()),1)', 'DATE(YEAR(TODAY()),MONTH(TODAY())+1,1)'],
  ['next-month', 'DATE(YEAR(TODAY()),MONTH(TODAY())+1,1)', 'DATE(YEAR(TODAY()),MONTH(TODAY())+2,1)'],
  ['last-quarter', 'DATE(YEAR(TODAY()),INT((MONTH(TODAY())-1)/3)*3-2,1)', 'DATE(YEAR(TODAY()),INT((MONTH(TODAY())-1)/3)*3+1,1)'],
  ['this-quarter', 'DATE(YEAR(TODAY()),INT((MONTH(TODAY())-1)/3)*3+1,1)', 'DATE(YEAR(TODAY()),INT((MONTH(TODAY())-1)/3)*3+4,1)'],
  ['next-quarter', 'DATE(YEAR(TODAY()),INT((MONTH(TODAY())-1)/3)*3+4,1)', 'DATE(YEAR(TODAY()),INT((MONTH(TODAY())-1)/3)*3+7,1)'],
  ['last-year', 'DATE(YEAR(TODAY())-1,1,1)', 'DATE(YEAR(TODAY()),1,1)'],
  ['this-year', 'DATE(YEAR(TODAY()),1,1)', 'DATE(YEAR(TODAY())+1,1,1)'],
  ['next-year', 'DATE(YEAR(TODAY())+1,1,1)', 'DATE(YEAR(TODAY())+2,1,1)'],
  ['year-to-date', 'DATE(YEAR(TODAY()),1,1)', 'TODAY()+1'],
] as const

for (const [period, start, end] of periods) test(`date filter ${period} applies both calendar boundaries through its option`, async ({ page }) => {
  await launch(page); await boundaries(page, start, end)
  await open(page); await choose(page, period); await apply(page)
  await rows(page, [2, 3, 4])
  await go(page, 'B4')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue(`=(${start})+0.75`)
  await open(page)
  await expect(page.getByLabel('Date period 1', { exact: true })).toHaveValue(period)
})
