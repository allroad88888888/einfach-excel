import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const saveStatus = (page: Page) => page.getByRole('status', { name: 'Local save status' })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)

async function open(page: Page) {
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
}

async function editAndWaitForSave(page: Page, value: string) {
  await select(page, 'B2', '1:1')
  const input = page.getByRole('textbox', { name: 'Active cell value' })
  await input.fill(value)
  await input.press('Enter')
  await expect(cell(page, '1:1')).toHaveText(value)
  await expect(saveStatus(page)).toContainText('Saved in this browser at')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?demo=local-restore')
  await open(page)
})

test('host snapshot restores edits after a page refresh', async ({ page }) => {
  await expect(cell(page, '1:1')).toHaveText('Acme Co.')
  await editAndWaitForSave(page, 'Restored after refresh')
  await page.reload()
  await open(page)
  await expect(cell(page, '1:1')).toHaveText('Restored after refresh')
  await expect(page.getByRole('tab', { name: 'Summary', exact: true })).toBeVisible()
  // 恢复是换簿，不是用户修改：撤销历史从空开始。
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

test('discarding the saved copy reloads the sample workbook', async ({ page }) => {
  await editAndWaitForSave(page, 'Throw me away')
  await page.getByRole('button', { name: 'Discard saved copy' }).click()
  await open(page)
  await expect(cell(page, '1:1')).toHaveText('Acme Co.')
  await expect(saveStatus(page)).toHaveText('Edits are saved in this browser and restored after a refresh.')
})

test('an unreadable saved snapshot falls back to the sample and reports the error', async ({ page }) => {
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('einfach-excel-demo', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const transaction = request.result.transaction('snapshots', 'readwrite')
      transaction.objectStore('snapshots').put('{"not":"a workbook"}', 'local-restore')
      transaction.oncomplete = () => { request.result.close(); resolve() }
    }
  }))
  await page.reload()
  await open(page)
  await expect(cell(page, '1:1')).toHaveText('Acme Co.')
  await expect(page.getByRole('region', { name: 'Local restore' }).getByRole('alert'))
    .toContainText('The saved copy could not be opened')
})
