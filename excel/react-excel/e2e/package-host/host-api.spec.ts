import { expect, test } from '@playwright/test'
import {
  start,
  cell,
  book,
  button,
  select,
  snapshot,
  eventCount,
  lastEvent,
  contains,
  noNewEvents,
} from './support'

for (const bundler of ['vite', 'rspack']) {
  test(`installed ${bundler} host typed batch writes literal strings and formulas in one transaction`, async ({
    page,
  }) => {
    await start(page, bundler)
    const result = await page.evaluate(() =>
      window.packageHost.write({
        cells: [
          {
            sheetId: 'orders',
            row: 4,
            col: 4,
            input: { kind: 'literal', value: { kind: 'string', value: '00123' } },
          },
          {
            sheetId: 'orders',
            row: 4,
            col: 5,
            input: { kind: 'literal', value: { kind: 'string', value: '=1+2' } },
          },
          { sheetId: 'target', row: 0, col: 0, input: { kind: 'formula', formula: '=1+2' } },
        ],
      }),
    )
    expect(result).toMatchObject({ status: 'ok', changed: true })
    expect((await lastEvent(page, 'host.writeCells')).source).toBe('api')
    expect(await snapshot(page, 'orders', 4, 4)).toMatchObject({
      input: '00123',
      value: { kind: 'string', value: '00123' },
    })
    expect(await snapshot(page, 'orders', 4, 5)).toMatchObject({
      value: { kind: 'string', value: '=1+2' },
    })
    expect(await snapshot(page, 'target', 0, 0)).toMatchObject({
      formula: '=1+2',
      value: { kind: 'number', value: 3 },
    })
    await button(page, 'Undo').click()
    expect(await snapshot(page, 'orders', 4, 4)).toBeNull()
    expect(await snapshot(page, 'target', 0, 0)).toBeNull()
    await expect(cell(page, '0:0')).toHaveText('1')
  })

  test(`installed ${bundler} failure noop refresh import and recalculation do not create user dirty events`, async ({
    page,
  }) => {
    await start(page, bundler)
    const initial = await eventCount(page)
    const result = await page.evaluate(async () => {
      const host = window.packageHost
      const noop = await host.write({
        cells: [
          {
            sheetId: 'orders',
            row: 0,
            col: 0,
            input: { kind: 'literal', value: { kind: 'number', value: 1 } },
          },
        ],
      })
      const failure = await host.write({
        cells: [
          {
            sheetId: 'orders',
            row: 1200,
            col: 0,
            input: { kind: 'literal', value: { kind: 'number', value: 9 } },
          },
        ],
      })
      return { noop, failure }
    })
    expect(result.noop).toMatchObject({ status: 'ok', changed: false })
    expect(result.failure.status).toBe('error')
    await noNewEvents(page, initial)
    await book(page)
      .getByRole('combobox', { name: 'Recalculate', exact: true })
      .selectOption('workbook')
    await noNewEvents(page, initial)
    await page.evaluate(() =>
      window.packageHost.write({
        source: 'refresh',
        cells: [
          {
            sheetId: 'orders',
            row: 0,
            col: 0,
            input: { kind: 'literal', value: { kind: 'number', value: 5 } },
          },
        ],
      }),
    )
    expect((await lastEvent(page, 'host.writeCells')).source).toBe('refresh')
    const previous = (await lastEvent(page)).connectionId
    const saved = await page.evaluate(() => window.packageHost.export())
    expect(await page.evaluate((text) => window.packageHost.replace(text), saved.text)).toBe(true)
    const imported = await lastEvent(page, 'workbook.open')
    expect(imported.source).toBe('import')
    expect(imported.connectionId).not.toBe(previous)
    await expect(cell(page, '0:0')).toHaveText('5')
    const count = await eventCount(page)
    expect(await page.evaluate(() => window.packageHost.replace('invalid file'))).toBe(false)
    await noNewEvents(page, count)
    const events = await page.evaluate(() => window.packageHost.events.first)
    expect(
      events.filter((event) => ['user', 'api', 'history'].includes(event.source)),
    ).toHaveLength(0)
    const importedSheet = await page.evaluate(
      () => window.packageHost.sheets().find((sheet) => sheet.name === 'Orders')!,
    )
    expect(await snapshot(page, importedSheet.id, 0, 1)).toMatchObject({
      value: { kind: 'string', value: 'Order 1' },
    })
  })

  test(`installed ${bundler} keyboard cross-sheet cut reports source destination and rewritten third-sheet formula`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await start(page, bundler)
    await select(page, 'A1', '0:0')
    await book(page).locator('[data-workbook-grid]').press('ControlOrMeta+x')
    await expect(book(page).getByLabel('Clipboard status')).toContainText('ready to move')
    await book(page).getByRole('tab', { name: 'Target', exact: true }).click()
    await select(page, 'C4', '3:2')
    await book(page).locator('[data-workbook-grid]').press('ControlOrMeta+v')
    await expect(cell(page, '3:2')).toHaveText('1')
    const event = await lastEvent(page, 'clipboard.paste')
    expect(contains(event, 'orders', 0, 0)).toBe(true)
    expect(contains(event, 'target', 3, 2)).toBe(true)
    expect(contains(event, 'audit', 29, 9)).toBe(true)
    expect(contains(event, 'audit', 0, 0)).toBe(false)
    expect(await snapshot(page, 'orders', 0, 0)).toBeNull()
    expect(await snapshot(page, 'audit', 29, 9)).toMatchObject({
      formula: '=Target!C4',
      value: { kind: 'number', value: 1 },
    })
    await button(page, 'Undo').click()
    const undo = await lastEvent(page, 'history.apply')
    expect(contains(undo, 'audit', 29, 9)).toBe(true)
    expect(await snapshot(page, 'orders', 0, 0)).toMatchObject({
      value: { kind: 'number', value: 1 },
    })
    expect(await snapshot(page, 'target', 3, 2)).toMatchObject({
      value: { kind: 'number', value: 99 },
    })
    await button(page, 'Redo').click()
    expect(contains(await lastEvent(page, 'history.apply'), 'audit', 29, 9)).toBe(true)
    expect(await snapshot(page, 'orders', 0, 1)).toMatchObject({
      value: { kind: 'string', value: 'Order 1' },
    })
  })
}
