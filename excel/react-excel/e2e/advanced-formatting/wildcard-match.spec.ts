import { expect, test } from '@playwright/test'
import { start, open, save, highlighted, cleanNeighbor, go, valueInput, button, dialog } from './support'

for (const width of [1280, 390]) {
  test(`AFMT-001 toolbar wildcard match preserves Unicode and escapes at ${width}px`, async ({ page }) => {
    await start(page, width, ['中文🙂', '中文🙂*', '中文🙂?', '中文a', '中文', 'other', '="中文🙂*"'])
    await open(page, 'text')
    await page.getByLabel('Text condition', { exact: true }).selectOption('matches-wildcard')
    await page.getByLabel('Matching text', { exact: true }).fill('中文?~*')
    await save(page)
    for (let row = 0; row < 7; row++) await highlighted(page, row, [1, 6].includes(row))
    await cleanNeighbor(page)
    await go(page, 'A2'); await expect(valueInput(page)).toHaveValue('中文🙂*')
    await go(page, 'A7'); await expect(valueInput(page)).toHaveValue('="中文🙂*"')
  })

  test(`wildcard errors keep correctable drafts and cancel leaves values untouched at ${width}px`, async ({ page }) => {
    await start(page, width, ['a*', 'abc'])
    await open(page, 'text')
    await page.getByLabel('Text condition', { exact: true }).selectOption('matches-wildcard')
    const input = page.getByLabel('Matching text', { exact: true })
    for (const [pattern, message] of [['', 'between 1 and 1024'], ['?'.repeat(1025), 'between 1 and 1024'], ['a~', 'Finish the wildcard escape']]) {
      await input.fill(pattern!); await button(page, 'Add rule').click()
      await expect(dialog(page).getByRole('alert')).toContainText(message!)
      await expect(input).toHaveValue(pattern!)
      await expect(dialog(page).getByRole('listitem')).toHaveCount(0)
    }
    await input.fill('a~*'); await save(page)
    await highlighted(page, 0); await highlighted(page, 1, false)
    await open(page); await button(page, 'Edit rule 1').click()
    await page.getByLabel('Matching text', { exact: true }).fill('b*')
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await expect(button(page, 'Conditional formatting')).toBeFocused()
    await highlighted(page, 0); await cleanNeighbor(page)
  })
}
