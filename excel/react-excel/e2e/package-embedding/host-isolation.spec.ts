import { expect, test, type Locator } from '@playwright/test'
import { fileURLToPath } from 'node:url'

async function edit(sheet: Locator, value: string) {
  const cell = sheet.locator('td[data-cell="1:0"]')
  await cell.dblclick()
  const editor = sheet.locator('[data-cell-editor] textarea')
  await editor.fill(value)
  await editor.press('Enter')
  await expect(cell).toHaveText(value)
  await expect(sheet.locator('td[data-cell="1:1"]')).toHaveText('Neighbor')
}

test('embedded workbook styles preserve host controls and document scrolling', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/e2e/package-embedding/host.html?locale=zh&renderer=canvas#host')
  await expect(page.locator('#first td[data-cell="1:0"]')).toHaveText('Original')
  await expect(page.locator('#second td[data-cell="1:0"]')).toHaveText('Original')
  expect(await page.evaluate(() => {
    const evidence = (window as unknown as { embeddingEvidence: {
      before: unknown; hostStyles(): unknown
    } }).embeddingEvidence
    return JSON.stringify(evidence.before) === JSON.stringify(evidence.hostStyles())
  })).toBe(true)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await expect(page.locator('#first .host-first')).toHaveCSS('height', '560px')
  await page.mouse.move(2, 20)
  await page.mouse.wheel(0, 500)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  await page.mouse.wheel(0, -1500)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  expect(errors).toEqual([])
})

test('editing one embedded workbook leaves its sibling data unchanged', async ({ page }) => {
  await page.goto('/e2e/package-embedding/host.html?locale=zh&renderer=canvas')
  const first = page.locator('#first'), second = page.locator('#second')
  await expect(first.locator('td[data-cell="1:0"]')).toHaveText('Original')
  await expect(second.locator('td[data-cell="1:0"]')).toHaveText('Original')
  await edit(first, 'First edit')
  await expect(second.locator('td[data-cell="1:0"]')).toHaveText('Original')
  await edit(second, 'Second edit')
  await expect(first.locator('td[data-cell="1:0"]')).toHaveText('First edit')
})

test('scrolling an embedded worksheet leaves its sibling and host stationary', async ({ page }) => {
  await page.goto('/e2e/package-embedding/host.html')
  const first = page.locator('#first'), second = page.locator('#second')
  await expect(first.locator('td[data-cell="1:0"]')).toHaveText('Original')
  await expect(second.locator('td[data-cell="1:0"]')).toHaveText('Original')
  await first.locator('.sheet-scroll').hover()
  await page.mouse.wheel(0, 700)
  await expect.poll(() => first.locator('.sheet-scroll').evaluate(node => node.scrollTop)).toBeGreaterThan(0)
  expect(await second.locator('.sheet-scroll').evaluate(node => node.scrollTop)).toBe(0)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  const name = first.getByRole('textbox', { name: 'Name box', exact: true })
  await name.fill('A2')
  await name.press('Enter')
  await expect(first.locator('td[data-cell="1:0"]')).toHaveText('Original')
})

test('unmounting one embedded workbook preserves sibling editing and history', async ({ page }) => {
  await page.goto('/e2e/package-embedding/host.html')
  const first = page.locator('#first'), second = page.locator('#second')
  await expect(second.locator('td[data-cell="1:0"]')).toHaveText('Original')
  await edit(second, 'Second edit')
  await page.locator('#unmount-first').click()
  await expect(first.locator('.workbook')).toHaveCount(0)
  await edit(second, 'Surviving edit')
  await second.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(second.locator('td[data-cell="1:0"]')).toHaveText('Second edit')
  await expect(second.locator('[data-merged-cell][data-cell="0:0"]')).toHaveText('Merged heading')
})

test('formula assistance keeps its instance theme geometry and editing focus', async ({ page }) => {
  await page.goto('/e2e/package-embedding/host.html')
  const first = page.locator('#first'), second = page.locator('#second')
  await expect(second.locator('td[data-cell="1:0"]')).toHaveText('Original')
  // 带偏移和 transform 的普通宿主仍由组件根定位浮层。
  await second.evaluate(node => { (node as HTMLElement).style.transform = 'translate(3px, 2px)' })
  await second.locator('td[data-cell="1:0"]').dblclick()
  const editor = second.locator('[data-cell-editor] textarea')
  await editor.fill('=SU')
  const functions = second.getByRole('listbox', { name: 'Formula functions' })
  await expect(functions).toBeVisible()
  await expect(first.locator('.formula-assist')).toHaveCount(0)
  const popup = second.locator('.formula-assist')
  await expect(popup).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  const bounds = await second.locator('.workbook').boundingBox(), floating = await popup.boundingBox()
  expect(floating!.x).toBeGreaterThanOrEqual(bounds!.x)
  expect(floating!.x + floating!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width)
  expect(floating!.y).toBeGreaterThanOrEqual(bounds!.y)
  await page.screenshot({ path: fileURLToPath(new URL(
    '../../../../.codex-artifacts/react-excel-package-002/embedded-formula-help.png', import.meta.url,
  )) })
  await page.mouse.move(2, 20)
  await page.mouse.wheel(0, 100)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  const movedRoot = await second.locator('.workbook').boundingBox(), movedPopup = await popup.boundingBox()
  expect(movedPopup!.x).toBeGreaterThanOrEqual(movedRoot!.x)
  expect(movedPopup!.y).toBeGreaterThanOrEqual(movedRoot!.y)
  await expect(editor).toBeFocused()
  await functions.getByRole('option', { name: /^SUM / }).click()
  await expect(editor).toBeFocused()
  await expect(editor).toHaveValue('=SUM(')
  await editor.fill('=SUM(1,2)')
  await editor.press('Enter')
  await expect(second.locator('td[data-cell="1:0"]')).toHaveText('3')
  await expect(first.locator('td[data-cell="1:0"]')).toHaveText('Original')
})
