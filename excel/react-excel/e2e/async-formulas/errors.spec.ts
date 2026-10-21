import { expect, test } from '@playwright/test'
import { cell, controlledJson, formula, neighbors, openAsyncDemo, write } from './fixtures'

test.beforeEach(async ({ page }) => openAsyncDemo(page))

for (const scenario of [
  { name: 'HTTP rejection', response: { status: 403, body: 'denied' }, error: '#N/A' },
  { name: 'bad JSON', response: { contentType: 'application/json', body: '{broken' }, error: '#VALUE!' },
  { name: 'response byte budget', response: { contentType: 'application/json',
    body: `"${'a'.repeat(1_048_576)}"` }, error: '#VALUE!' },
  { name: 'result cell budget', response: { contentType: 'application/json',
    body: JSON.stringify(Array.from({ length: 65 }, () => Array(64).fill(1))) }, error: '#VALUE!' },
  { name: 'redirect rejection', response: { status: 302, headers: { location: '/demo/async-formulas/result.json' } }, error: '#N/A' },
]) test(`real Worker fetch reports ${scenario.name} as an explicit spreadsheet error`, async ({ page }) => {
  await page.route('**/demo/async-formulas/error.json', route => route.fulfill(scenario.response))
  await write(page, 'B12', '11:1', formula('error'))
  await expect(cell(page, '11:1')).toHaveText(scenario.error)
  await neighbors(page)
})

test('a real response exceeding the timeout aborts and settles #N/A', async ({ page }) => {
  const http = await controlledJson(page, 'timeout')
  await write(page, 'B12', '11:1', formula('timeout'))
  await expect(cell(page, '11:1')).toHaveText('#BUSY!')
  await expect(cell(page, '11:1')).toHaveText('#N/A', { timeout: 8_000 })
  await http.release(0, 99)
  await expect(cell(page, '11:1')).toHaveText('#N/A')
  await neighbors(page)
})

test('cross-origin URLs and prototype paths are rejected with no external network request', async ({ page }) => {
  let externalRequests = 0
  await page.route('https://outside.invalid/**', route => { externalRequests += 1; return route.abort() })
  await write(page, 'B12', '11:1', '=FETCHJSON("https://outside.invalid/value.json")')
  await expect(cell(page, '11:1')).toHaveText('#VALUE!')
  expect(externalRequests).toBe(0)
  await write(page, 'B14', '13:1', formula('result', '/constructor'))
  await expect(cell(page, '13:1')).toHaveText('#VALUE!')
  await neighbors(page)
})
