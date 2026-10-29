import { expect, type Page } from '@playwright/test'
import type {} from '../../package-consumers/host/bridge'
import type { WorkbookChangeEvent } from '@einfach-excel/spreadsheet-ui-core'
import { packageURL } from '../../playwright.package.config'

export const book = (page: Page) => page.locator('#first .workbook[data-runtime-state="ready"]')
export const cell = (page: Page, coord: string) => book(page).locator(`td[data-cell="${coord}"]`)
export const button = (page: Page, name: string) =>
  book(page).getByRole('button', { name, exact: true })
export const formula = (page: Page) =>
  book(page).getByRole('textbox', { name: 'Active cell value', exact: true })

export async function start(page: Page, bundler: string) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('requestfailed', (request) =>
    errors.push(`${request.url()}: ${request.failure()?.errorText}`),
  )
  await page.goto(`${packageURL}/${bundler}/`)
  await expect(cell(page, '0:0')).toHaveText('1')
  await expect(page.locator('#second td[data-cell="0:0"]')).toHaveText('1')
  return errors
}
export async function select(page: Page, address: string, coord: string) {
  const name = book(page).getByRole('textbox', { name: 'Name box', exact: true })
  await name.fill(address)
  await name.press('Enter')
  await expect(cell(page, coord)).toBeVisible()
  await expect(book(page).locator('[data-workbook-grid]')).toHaveAttribute(
    'data-projection-retained',
    'false',
  )
}
export async function edit(page: Page, value: string) {
  await formula(page).fill(value)
  await formula(page).press('Enter')
}
export async function snapshot(page: Page, sheetId: string, row: number, col: number) {
  return page.evaluate(
    async ({ sheetId: targetSheet, row: targetRow, col: targetCol }) => {
      const read = await window.packageHost.read({
        targets: [
          {
            sheetId: targetSheet,
            range: {
              rowStart: targetRow,
              rowEnd: targetRow,
              colStart: targetCol,
              colEnd: targetCol,
            },
          },
        ],
      })
      if (read.status !== 'ok') throw new Error(JSON.stringify(read))
      return read.ranges[0].cells[0] ?? null
    },
    { sheetId, row, col },
  )
}
export async function eventCount(page: Page) {
  return page.evaluate(() => window.packageHost.events.first.length)
}
export async function lastEvent(page: Page, kind?: string): Promise<WorkbookChangeEvent> {
  if (kind)
    await expect
      .poll(() => page.evaluate(() => window.packageHost.events.first.at(-1)?.kind))
      .toBe(kind)
  return page.evaluate(() => window.packageHost.events.first.at(-1)!)
}
export function contains(event: WorkbookChangeEvent, sheetId: string, row: number, col: number) {
  return event.changes.some(
    (change) =>
      change.sheetId === sheetId &&
      change.ranges.some(
        (range) =>
          row >= range.rowStart &&
          row <= range.rowEnd &&
          col >= range.colStart &&
          col <= range.colEnd,
      ),
  )
}
export async function noNewEvents(page: Page, count: number) {
  // 只读原生 RPC 作为队列屏障，避免靠固定 sleep 掩盖迟到事件。
  const sheetId = await page.evaluate(() => window.packageHost.sheets()[0].id)
  await snapshot(page, sheetId, 0, 0)
  expect(await eventCount(page)).toBe(count)
}
