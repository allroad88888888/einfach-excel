import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { openDateFile as openFile, downloadDateFile as downloadFile } from '../support/conditional-dates'
import { patternCell as cell, patternButton as button, expectPattern } from '../support/pattern-fill'
import { patternMasks } from '../support/pattern-pixels'

test('external patterns survive Excel and native reopening without the optional editor', async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  const bytes = await readFile(fileURLToPath(new URL('./pattern-external.xlsx', import.meta.url)))
  await openFile(page, bytes, 'xlsx')
  for (let pass = 0; pass < 3; pass++) {
    const nativeBytes = await downloadFile(page)
    const native = JSON.parse(nativeBytes.toString()).workbook
    const styles = native.formats.flatMap((range: { cellStyles: unknown[] }) => range.cellStyles)
    for (const [i, pattern] of Object.keys(patternMasks).entries()) {
      expect(styles.find((entry: { addr: string }) => entry.addr === `A${i + 1}`).format).toMatchObject({
        fill: { kind: 'pattern', pattern, foreground: '#c00000' }, bgColor: '#fff2cc',
      })
    }
    await select(page, 'A19', '18:0')
    await expectPattern(page, '18:0')
    await expectPattern(page, '18:1', 'mediumGray')
    await expectPattern(page, '18:2', 'mediumGray')
    await select(page, 'A20', '19:0')
    await expectPattern(page, '19:0', 'lightUp', '#0000ff')
    await expect(cell(page, '19:0')).toHaveCSS('background-color', 'rgb(128, 128, 128)')
    if (pass === 0) await openFile(page, await downloadFile(page, true), 'xlsx')
    if (pass === 1) await openFile(page, nativeBytes)
  }
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('native demo pattern examples are real persisted formats without the editor plugin', async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'H15', '14:7')
  await expect(cell(page, '14:7')).toHaveText('Pattern fill')
  await expectPattern(page, '14:7', 'lightDown')
  await expectPattern(page, '15:7', 'gray125', '#008000')
  const source = JSON.parse((await downloadFile(page)).toString()).workbook
  const styles = source.formats.filter((range: { sheet: number }) => range.sheet === 1)
    .flatMap((range: { cellStyles: unknown[] }) => range.cellStyles)
  expect(styles.find((style: { addr: string }) => style.addr === 'H16').format.fill.pattern).toBe('gray125')
  expect(styles.find((style: { addr: string }) => style.addr === 'F15').format.borders.diagDown).toBeDefined()
})
