import { expect, test, type Locator } from '@playwright/test'
import { select } from '../support/clipboard'

async function caret(input: Locator, draft: string, position: number) {
  await input.fill(draft)
  // Collapse a full selection to the real start, not a wrapped visual line.
  await input.press('ControlOrMeta+a')
  await input.press('ArrowLeft')
  for (let index = 0; index < position; index++) await input.press('ArrowRight')
}

for (const width of [1280, 390]) for (const source of ['cell', 'formula']) {
  test(`HELP-004 ${source} actual parameter groups and suffixes at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/')
    const target = await select(page, 'B2', '1:1')
    if (source === 'cell') await target.dblclick()
    const input = page.getByRole('textbox', {
      name: source === 'cell' ? 'Cell editor' : 'Active cell value', exact: true,
    })
    const cases = [
      { draft: '=SUMIFS(E2:E3,E2:E3,">0",E2:E3,">0",E2:E3,">0")', token: 'E2:E3,">0")', arg: 'criteria_range' },
      { draft: '=LET(a,1,b,2,c,3,a+b+c)', token: 'c,3', arg: 'name' },
      { draft: '=LET(a,1,b,2,c,3,a+b+c)', token: 'a+b+c', arg: 'calculation' },
      { draft: '=MAP({1,2},{3,4},{5,6},LAMBDA(a,b,c,a+b+c))', token: '{5,6}', arg: 'array' },
      { draft: '=MAP({1,2},{3,4},{5,6},LAMBDA(a,b,c,a+b+c))', token: 'LAMBDA', arg: 'lambda' },
      { draft: '=AGGREGATE(14,0,E2:E3,2)', token: '2)', arg: 'k' },
      { draft: '=AGGREGATE(9,0,E2:E3,E2:E3)', token: 'E2:E3)', arg: 'array' },
      { draft: '=NORM.S.DIST(0,TRUE)', token: 'TRUE', arg: 'cumulative' },
    ]
    for (const { draft, token, arg } of cases) {
      await test.step(`${draft} → ${arg}`, async () => {
        await caret(input, draft, draft.indexOf(token))
        const help = page.getByRole('status', { name: 'Formula arguments' })
        await expect(help.locator('[data-formula-active-argument] code')).toHaveText(arg)
        await expect(help.locator('strong')).toContainText(arg)
        await expect(input).toHaveValue(draft)
        await expect(target).toHaveText('Acme Co.')
        await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
      })
    }
    await input.fill('=PI(')
    const help = page.getByRole('status', { name: 'Formula arguments' })
    await expect(help).toContainText('PI()')
    await expect(help.locator('strong')).toHaveCount(0)
    await expect(help.locator('[data-formula-active-argument]')).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath(`help-${source}-${width}.png`) })
    await input.press('Escape')
    await expect(help).toHaveCount(0)
    await expect(target).toHaveText('Acme Co.')
    await expect(page.locator('[data-cell="2:1"]')).toHaveText('Northwind')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  })
}

for (const width of [1280, 390]) test(`HELP-005 picker, draft, native commit and one history step at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 })
  await page.goto('/')
  const target = await select(page, 'B2', '1:1')
  await page.getByRole('button', { name: 'Insert function', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Search functions' }).fill('LET')
  await page.getByRole('listbox', { name: 'Function', exact: true }).selectOption('LET')
  await expect(page.locator('[data-formula-help="LET"]')).toContainText('calculation')
  await page.getByRole('button', { name: 'Insert draft', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Active cell value', exact: true })
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('=LET(')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await input.fill('=LET(x,3,x*2)')
  await input.press('Enter')
  await expect(target).toHaveText('6')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(target).toHaveText('Acme Co.')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(target).toHaveText('6')
  await expect(page.locator('[data-cell="2:1"]')).toHaveText('Northwind')
})
