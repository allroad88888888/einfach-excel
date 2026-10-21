import { expect, type Page, type Route } from '@playwright/test'
import { select } from '../support/clipboard'

export const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
export const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const bar = (page: Page) => page.getByRole('textbox', { name: 'Active cell value', exact: true })
export const calculate = (page: Page) => page.getByRole('combobox', { name: 'Recalculate', exact: true })
export const formula = (name: string, pointer?: string) =>
  `=FETCHJSON("/demo/async-formulas/${name}.json"${pointer === undefined ? '' : `,"${pointer}"`})`

export async function openAsyncDemo(page: Page) {
  await page.goto('/?demo=async-formulas')
  await expect(cell(page, '2:1')).toHaveText('21.5')
}
export async function write(page: Page, address: string, coord: string, value: string) {
  await select(page, address, coord)
  await expect(bar(page)).toBeEnabled()
  await bar(page).fill(value)
  await bar(page).press('Enter')
}
export async function neighbors(page: Page) {
  await select(page, 'B3', '2:1')
  await expect(cell(page, '2:1')).toHaveText('21.5')
  await expect(cell(page, '2:2')).toHaveText('43')
}

/** The response is a real same-origin Worker HTTP request; tests control only its completion. */
export async function controlledJson(page: Page, name: string) {
  const requests: { route: Route; release(value: unknown): void }[] = []
  await page.route(`**/demo/async-formulas/${name}.json`, async route => {
    const value = await new Promise<unknown>(resolve => { requests.push({ route, release: resolve }) })
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) })
      .catch(() => undefined) // Disposed workers abort their outstanding network request.
  })
  return {
    requests,
    async release(index: number, value: unknown) {
      await expect.poll(() => requests.length).toBeGreaterThan(index)
      requests[index].release(value)
    },
  }
}
