import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { bar, button, calculate, cell, controlledJson, formula, neighbors, openAsyncDemo, write } from './fixtures'

test.beforeEach(async ({ page }) => openAsyncDemo(page))

test('enter FETCHJSON through the formula bar and settle real HTTP with native dependents', async ({ page }) => {
  const http = await controlledJson(page, 'primary')
  await write(page, 'B12', '11:1', formula('primary', '/price'))
  await expect(cell(page, '11:1')).toHaveText('#BUSY!')
  await write(page, 'C12', '11:2', '=B12*2')
  await expect(cell(page, '11:2')).toHaveText('#BUSY!')
  await http.release(0, { price: 7 })
  await expect(cell(page, '11:1')).toHaveText('7')
  await expect(cell(page, '11:2')).toHaveText('14')
  await write(page, 'B14', '13:1', formula('primary', '/price'))
  await expect(cell(page, '13:1')).toHaveText('7')
  expect(http.requests).toHaveLength(1)
  await calculate(page).selectOption('workbook')
  await expect(cell(page, '13:1')).toHaveText('7')
  expect(http.requests).toHaveLength(1)
  await neighbors(page)
})

test('retry a failed FETCHJSON with the existing Recalculate control', async ({ page }) => {
  let requests = 0
  await page.route('**/demo/async-formulas/retry.json', route => {
    requests += 1
    return route.fulfill(requests === 1 ? { status: 503, body: 'unavailable' }
      : { contentType: 'application/json', body: '9' })
  })
  await write(page, 'B12', '11:1', formula('retry'))
  await expect(cell(page, '11:1')).toHaveText('#N/A')
  await calculate(page).selectOption('sheet')
  await expect(cell(page, '11:1')).toHaveText('9')
  expect(requests).toBe(2)
  await button(page, 'Undo').click()
  await expect(cell(page, '11:1')).toHaveText('')
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await expect(cell(page, '11:1')).toHaveText('9')
  await neighbors(page)
})

test('actual JSON arrays spill through Rust and update cross-sheet formulas', async ({ page }) => {
  const http = await controlledJson(page, 'array')
  await write(page, 'B12', '11:1', formula('array', '/matrix'))
  await write(page, 'E12', '11:4', '=SUM(B12#)')
  await page.getByRole('tab', { name: 'Async Summary', exact: true }).click()
  await write(page, 'B12', '11:1', "='Async JSON'!E12*2")
  await expect(cell(page, '11:1')).toHaveText('#BUSY!')
  await http.release(0, { matrix: [[1, 2], [3, 4]] })
  await expect(cell(page, '11:1')).toHaveText('20')
  await page.getByRole('tab', { name: 'Async JSON', exact: true }).click()
  await select(page, 'B12', '11:1')
  await expect(cell(page, '11:2')).toHaveText('2')
  await expect(cell(page, '12:1')).toHaveText('3')
  await expect(cell(page, '12:2')).toHaveText('4')
  await expect(cell(page, '11:4')).toHaveText('10')
  await neighbors(page)
})

test('settlement on a protected worksheet computes existing formulas without changing their source', async ({ page }) => {
  const http = await controlledJson(page, 'protected')
  await write(page, 'B12', '11:1', formula('protected'))
  await button(page, 'Worksheet protection').click()
  await button(page, 'Protect worksheet').click()
  await button(page, 'Close').click()
  await http.release(0, 17)
  await expect(cell(page, '11:1')).toHaveText('17')
  await select(page, 'B12', '11:1')
  await expect(bar(page)).toHaveValue(formula('protected'))
})

test('a pending formula settles without stealing an unfinished formula bar draft or focus', async ({ page }) => {
  const http = await controlledJson(page, 'focus')
  await write(page, 'B12', '11:1', formula('focus'))
  await select(page, 'C12', '11:2')
  await bar(page).fill('=SUM(')
  await http.release(0, 11)
  await expect(cell(page, '11:1')).toHaveText('11')
  await expect(bar(page)).toHaveValue('=SUM(')
  await expect(bar(page)).toBeFocused()
  await bar(page).press('Escape')
  await neighbors(page)
})
