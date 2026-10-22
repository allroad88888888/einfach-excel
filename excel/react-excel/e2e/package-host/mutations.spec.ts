import { expect, test } from '@playwright/test'
import {
  start,
  cell,
  book,
  button,
  select,
  edit,
  snapshot,
  eventCount,
  lastEvent,
  contains,
  noNewEvents,
} from './support'

for (const bundler of ['vite', 'rspack']) {
  test(`installed ${bundler} package embeds complete isolated workbooks and typed thousand-row data`, async ({
    page,
  }, info) => {
    const errors = await start(page, bundler)
    await expect(book(page).getByRole('tab', { name: 'Orders', exact: true })).toBeVisible()
    await expect(button(page, 'Undo')).toBeDisabled()
    await expect(page.locator('#second').getByRole('combobox', { name: '界面语言' })).toHaveValue(
      'zh',
    )
    const evidence = await page.evaluate(async () => ({
      before: window.packageHost.before,
      after: window.packageHost.style(),
      workers: window.packageHost.workers,
      read: await window.packageHost.read({
        targets: [
          { sheetId: 'orders', range: { rowStart: 999, rowEnd: 999, colStart: 0, colEnd: 1 } },
          { sheetId: 'orders', range: { rowStart: 0, rowEnd: 0, colStart: 2, colEnd: 3 } },
          { sheetId: 'audit', range: { rowStart: 29, rowEnd: 29, colStart: 9, colEnd: 9 } },
        ],
      }),
    }))
    expect(evidence.after).toEqual(evidence.before)
    expect(evidence.workers).toMatchObject({ created: 2, live: 2, customCalls: 1, terminated: 0 })
    expect(evidence.read.status).toBe('ok')
    if (evidence.read.status === 'ok') {
      expect(evidence.read.ranges[0].cells.map((entry) => entry.value)).toEqual([
        { kind: 'number', value: 1000 },
        { kind: 'string', value: 'Order 1000' },
      ])
      expect(evidence.read.ranges[1].cells[0].value).toEqual({ kind: 'number', value: 0.125 })
      expect(evidence.read.ranges[1].cells[1]).toMatchObject({
        formula: '=A1*2',
        value: { kind: 'number', value: 2 },
      })
      expect(new Set(evidence.read.ranges.map((range) => range.revision)).size).toBe(1)
    }
    await expect(cell(page, '0:2')).toHaveText('12.5%')
    await page.getByRole('button', { name: 'Host control', exact: true }).hover()
    await page.mouse.wheel(0, 400)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    // 宿主按钮已滚出视口；移到文档边距，避免反向滚轮落入工作簿网格。
    await page.mouse.move(5, 5)
    await page.mouse.wheel(0, -1000)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    await page.screenshot({ path: info.outputPath(`installed-${bundler}.png`) })
    expect(errors).toEqual([])
  })

  test(`installed ${bundler} DOM editing publishes actual native ranges for incremental saving`, async ({
    page,
  }) => {
    const errors = await start(page, bundler)
    const before = await eventCount(page)
    await cell(page, '0:0').dblclick()
    const editor = book(page).getByRole('textbox', { name: 'Cell editor', exact: true })
    await editor.fill('7')
    await editor.press('Enter')
    await expect(cell(page, '0:0')).toHaveText('7')
    const event = await lastEvent(page, 'cell.setInput')
    expect(event.source).toBe('user')
    expect(contains(event, 'orders', 0, 0)).toBe(true)
    expect(contains(event, 'orders', 0, 1)).toBe(false)
    expect(await eventCount(page)).toBe(before + 1)
    const read = await page.evaluate(
      (targets) => window.packageHost.read({ targets }),
      event.changes.flatMap((change) =>
        change.ranges.map((range) => ({ sheetId: change.sheetId, range })),
      ),
    )
    expect(read.status).toBe('ok')
    if (read.status === 'ok')
      expect(read.ranges[0].cells[0].value).toEqual({ kind: 'number', value: 7 })
    await expect(page.locator('#second td[data-cell="0:0"]')).toHaveText('1')
    await expect(cell(page, '0:1')).toHaveText('Order 1')
    expect(errors).toEqual([])
  })

  test(`installed ${bundler} external keyboard paste publishes typed cell inputs`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const errors = await start(page, bundler)
    await page.evaluate(() => navigator.clipboard.writeText('31\t=2+3\nTRUE\t0.25'))
    await select(page, 'E2', '1:4')
    await book(page).locator('[data-workbook-grid]').press('ControlOrMeta+v')
    await expect(book(page).getByLabel('Clipboard status')).toHaveText('Pasted cells.')
    const event = await lastEvent(page, 'clipboard.paste')
    expect(contains(event, 'orders', 1, 4)).toBe(true)
    expect(contains(event, 'orders', 2, 5)).toBe(true)
    expect(await snapshot(page, 'orders', 1, 5)).toMatchObject({
      formula: '=2+3',
      value: { kind: 'number', value: 5 },
    })
    expect(await snapshot(page, 'orders', 2, 4)).toMatchObject({
      value: { kind: 'boolean', value: true },
    })
    await expect(cell(page, '1:1')).toHaveText('Order 2')
    expect(errors).toEqual([])
  })

  test(`installed ${bundler} Delete clears actual cells without notifying blank neighbors`, async ({
    page,
  }) => {
    await start(page, bundler)
    await select(page, 'A2:A3', '1:0')
    await book(page).locator('[data-workbook-grid]').press('Delete')
    await expect(cell(page, '1:0')).toHaveText('')
    const event = await lastEvent(page, 'range.clear')
    expect(contains(event, 'orders', 1, 0)).toBe(true)
    expect(contains(event, 'orders', 2, 0)).toBe(true)
    expect(contains(event, 'orders', 1, 1)).toBe(false)
    expect(await snapshot(page, 'orders', 1, 0)).toBeNull()
    await expect(cell(page, '1:1')).toHaveText('Order 2')
    const count = await eventCount(page)
    await book(page).locator('[data-workbook-grid]').press('Delete')
    await noNewEvents(page, count)
  })

  test(`installed ${bundler} keyboard fill emits actual target ranges and preserves formula sources`, async ({
    page,
  }) => {
    await start(page, bundler)
    await select(page, 'D1:D3', '0:3')
    await book(page).locator('[data-workbook-grid]').press('Control+d')
    await expect(cell(page, '2:3')).toHaveText('6')
    const event = await lastEvent(page, 'range.fill')
    expect(contains(event, 'orders', 1, 3)).toBe(true)
    expect(contains(event, 'orders', 2, 3)).toBe(true)
    expect(contains(event, 'orders', 0, 3)).toBe(false)
    expect(await snapshot(page, 'orders', 2, 3)).toMatchObject({
      formula: expect.stringContaining('A3'),
      value: { kind: 'number', value: 6 },
    })
    await expect(cell(page, '0:2')).toHaveText('12.5%')
  })

  test(`installed ${bundler} toolbar undo and redo publish history changes with original typed values`, async ({
    page,
  }) => {
    await start(page, bundler)
    await select(page, 'A1', '0:0')
    await edit(page, '8')
    await expect(cell(page, '0:0')).toHaveText('8')
    await button(page, 'Undo').click()
    await expect(cell(page, '0:0')).toHaveText('1')
    expect((await lastEvent(page, 'history.apply')).source).toBe('history')
    expect(await snapshot(page, 'orders', 0, 0)).toMatchObject({
      value: { kind: 'number', value: 1 },
    })
    await button(page, 'Redo').click()
    await expect(cell(page, '0:0')).toHaveText('8')
    expect((await lastEvent(page, 'history.apply')).source).toBe('history')
    await expect(cell(page, '0:1')).toHaveText('Order 1')
  })
}
