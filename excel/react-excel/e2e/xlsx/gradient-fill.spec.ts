import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { openDateFile as openFile, downloadDateFile as downloadFile } from '../support/conditional-dates'
import { cell, button, nativeFormat, nativeWorkbook } from '../support/gradient-fill'

test('external Excel gradients preserve degrees coordinates and full stop order through both reopen routes', async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, await readFile(fileURLToPath(new URL('./gradient-external.xlsx', import.meta.url))), 'xlsx')
  const before = await nativeWorkbook(page)
  for (let pass = 0; pass < 3; pass++) {
    expect((await nativeFormat(page, 'A1')).fill).toEqual({ kind: 'linear-gradient', degree: -45,
      stops: [{ position: 0, color: '#ff0000' }, { position: 0.4, color: '#00ff00' }, { position: 1, color: '#0000ff' }] })
    expect((await nativeFormat(page, 'A2')).fill).toMatchObject({ kind: 'path-gradient', left: 0.1, right: 0.7,
      top: 0.2, bottom: 0.6, stops: [{ position: 0, color: '#808080' },
        { position: 0.4, color: '#0000ff' }, { position: 1, color: '#ff0000' }] })
    expect((await nativeFormat(page, 'A3')).fill).toEqual({ kind: 'path-gradient', left: 0, right: 0, top: 0, bottom: 0,
      stops: [{ position: 0.3, color: '#abcdef' }] })
    expect((await nativeFormat(page, 'A4')).fill).toEqual({ kind: 'path-gradient', left: 0.9, right: 0.1, top: 0.8, bottom: 0.2,
      stops: [{ position: 1, color: '#0000ff' }, { position: 0, color: '#ff0000' },
        { position: 0.5, color: '#00ff00' }, { position: 0.5, color: '#ff00ff' }] })
    expect((await nativeFormat(page, 'A5')).fill.stops).toEqual([])
    await select(page, 'A7', '6:0')
    await expect(cell(page, '6:0')).toHaveCSS('background-image', 'none')
    await expect(cell(page, '6:1')).toHaveCSS('background-image', /linear-gradient/)
    await expect(cell(page, '6:3')).toHaveCSS('background-image', /linear-gradient/)
    await expect(cell(page, '5:3')).toHaveCSS('background-image', /data:image\/svg\+xml/)
    expect((await nativeWorkbook(page)).cells).toEqual(before.cells)
    const native = await downloadFile(page)
    if (pass === 0) await openFile(page, await downloadFile(page, true), 'xlsx')
    if (pass === 1) await openFile(page, native)
  }
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('native demo linear rectangular and multicolor gradients render without an editor plugin', async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'H11', '10:7')
  await expect(cell(page, '10:7')).toHaveText('Linear gradient')
  await expect(cell(page, '10:7')).toHaveCSS('background-image', /linear-gradient/)
  await expect(cell(page, '11:7')).toHaveCSS('background-image', /data:image\/svg\+xml/)
  const source = await nativeWorkbook(page)
  const styles = source.formats.filter((range: { sheet: number }) => range.sheet === 1)
    .flatMap((range: { cellStyles: unknown[] }) => range.cellStyles)
  expect(styles.find((style: { addr: string }) => style.addr === 'H12').format.fill.kind).toBe('path-gradient')
  expect(styles.find((style: { addr: string }) => style.addr === 'H13').format.fill.stops).toHaveLength(3)
  await expect(button(page, 'Gradient fill')).toHaveCount(0)
})
