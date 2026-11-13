import { readFile } from 'node:fs/promises'
import { expect, test, type Locator } from '@playwright/test'
import { openDateFile as openFile } from '../support/conditional-dates'
import { select } from '../support/clipboard'
import { showRibbonControl } from '../support/ribbon'
import { applyBaseline, baselineButton as button, baselineCell as cell,
  baselineGlyphBox } from '../support/font-baseline'
import { glyphPixels } from '../support/font-baseline-pixels'

function fixture(merged = false, fontBaseline = 'normal') {
  return Buffer.from(JSON.stringify({
    format: 'einfach-workbook', version: 1, title: 'Rotated baseline',
    canvases: [{ rowCount: 30, colCount: 8 }],
    workbook: { version: 1,
      sheets: [{ idx: 0, name: 'Rotation', defaults: {
        rowHeight: merged ? 55 : 110, colWidth: merged ? 110 : 220,
      } }],
      cells: [{ sheet: 0, addr: 'B2', row: 1, col: 1, kind: 'text', value: 'Rotated Hg' }],
      formats: [{ sheet: 0, startRow: 1, endRow: 1, startCol: 1, endCol: 1,
        cellStyles: [{ addr: 'B2', format: { fontSize: 28, fontFamily: 'Arial',
          fgColor: '#d00000', rotation: 30, align: 'center', verticalAlign: 'center', fontBaseline } }] }],
      ...(merged ? { merges: [{ sheet: 0, ranges: [[1, 1, 3, 3]] }] } : {}),
    },
  }))
}

async function expectUnclippedText(target: Locator) {
  // Only text nodes count: a new layout wrapper must not make this assertion pass.
  const glyph = await baselineGlyphBox(target)
  const clip = (await target.locator('.cell-content').boundingBox())!
  const box = (await target.boundingBox())!
  expect(glyph.x).toBeGreaterThan(clip.x)
  expect(glyph.x + glyph.width).toBeLessThan(clip.x + clip.width)
  expect(glyph.y).toBeGreaterThan(clip.y)
  expect(glyph.bottom).toBeLessThan(clip.y + clip.height)
  return { glyph, clip, box }
}

test('rotated normal and baseline text fits the actual clip and matches full PNG glyph extents', async ({ page }, info) => {
  await page.goto('/?plugins=image-export')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, fixture())
  const target = cell(page, '1:1')
  await select(page, 'D1', '0:3')
  const initial = (await target.boundingBox())!
  const evidence = []
  for (const effect of ['normal', 'Superscript', 'Subscript'] as const) {
    if (effect !== 'normal') {
      await select(page, 'B2', '1:1'); await applyBaseline(page, effect)
      await expect(target.locator('[data-font-baseline]')).toHaveAttribute('data-font-baseline', effect.toLowerCase())
      await select(page, 'D1', '0:3')
    }
    const geometry = await expectUnclippedText(target)
    expect(geometry.box.height).toBe(initial.height)
    expect(geometry.box.width).toBe(initial.width)
    await expect(target).toHaveCSS('font-size', '28px')
    const dom = await target.screenshot()
    const domInk = (await glyphPixels(page, dom))[0]!
    await info.attach(`${effect}-dom.png`, { body: dom, contentType: 'image/png' })
    await select(page, 'B2', '1:1')
    await showRibbonControl(page, 'Export selection as image')
    await button(page, 'Export selection as image').click()
    const pending = page.waitForEvent('download')
    await button(page, 'Download PNG').click()
    const png = await readFile((await (await pending).path())!)
    const pngInk = (await glyphPixels(page, png))[0]!
    await info.attach(`${effect}-export.png`, { body: png, contentType: 'image/png' })
    // Both raster paths must paint the whole diagonal, not a one-line horizontal slice.
    expect(domInk.count).toBeGreaterThan(100)
    expect(pngInk.count).toBeGreaterThan(100)
    expect(domInk.height / pngInk.height).toBeGreaterThan(0.85)
    expect(domInk.height / pngInk.height).toBeLessThan(1.15)
    expect(domInk.top).toBeGreaterThan(3)
    expect(domInk.bottom).toBeLessThan(initial.height - 3)
    evidence.push({ effect, geometry, domInk, pngInk })
    await page.getByRole('dialog', { name: 'Export selection as image' })
      .getByRole('button', { name: 'Close', exact: true }).click()
  }
  await info.attach('rotation-pixels.json', { body: JSON.stringify(evidence), contentType: 'application/json' })
  await expect(cell(page, '1:2')).toHaveText('')
})

for (const effect of ['superscript', 'subscript']) {
  test(`merged rotated ${effect} retains complete glyphs across four frozen fragments`, async ({ page }, info) => {
    await page.goto('/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await openFile(page, fixture(true, effect))
    await select(page, 'E1', '0:4')
    const fragments = page.locator('[data-merged-cell="true"][data-cell="1:1"]')
    await expect(fragments).toHaveCount(1)
    const initial = await expectUnclippedText(fragments.first())
    // The scroll surface includes both the body and its sibling frozen panes.
    const grid = page.getByTestId('sheet-scroll')
    const before = (await glyphPixels(page, await grid.screenshot()))[0]!
    // A selection inside a merge resolves to its anchor. Freeze first, then
    // recreate the same merge, so C3 actually splits it across four panes.
    await select(page, 'B2:D4', '1:1')
    await showRibbonControl(page, 'Merge cells')
    await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('unmerge')
    await expect(fragments).toHaveCount(0)
    await select(page, 'C3', '2:2')
    await showRibbonControl(page, 'Freeze panes')
    await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('selection')
    await select(page, 'B2:D4', '1:1')
    await showRibbonControl(page, 'Merge cells')
    await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('merge')
    await expect(fragments).toHaveCount(4)
    for (const fragment of await fragments.all()) {
      const geometry = await expectUnclippedText(fragment)
      expect(geometry.box.width).toBe(initial.box.width)
      expect(geometry.box.height).toBe(initial.box.height)
      expect(geometry.glyph.y - geometry.box.y).toBeCloseTo(initial.glyph.y - initial.box.y, 1)
      expect(geometry.glyph.x - geometry.box.x).toBeCloseTo(initial.glyph.x - initial.box.x, 1)
    }
    const png = await grid.screenshot()
    const after = (await glyphPixels(page, png))[0]!
    await info.attach(`${effect}-frozen.png`, { body: png, contentType: 'image/png' })
    await info.attach(`${effect}-frozen-pixels.json`, { body: JSON.stringify({ before, after }), contentType: 'application/json' })
    expect(before.count).toBeGreaterThan(100)
    expect(after.count / before.count).toBeGreaterThan(0.95)
    expect(after.count / before.count).toBeLessThan(1.05)
    expect(after.height).toBe(before.height)
  })
}
