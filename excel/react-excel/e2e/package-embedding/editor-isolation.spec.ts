import { expect, test, type Locator, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const artifactDirectory = fileURLToPath(new URL(
  '../../../../.codex-artifacts/react-excel-package-002', import.meta.url,
))

async function scrollPositions(page: Page) {
  return page.evaluate(() => ({
    window: [window.scrollX, window.scrollY],
    sheets: [...document.querySelectorAll('.sheet-scroll')].map(node => [node.scrollLeft, node.scrollTop]),
  }))
}

async function expectPopupInside(sheet: Locator) {
  await expect.poll(() => sheet.locator('.formula-assist').evaluate(popup => {
    const root = popup.closest('.einfach-spreadsheet')!.getBoundingClientRect()
    const bounds = popup.getBoundingClientRect()
    return bounds.left >= root.left && bounds.top >= root.top &&
      bounds.right <= root.right && bounds.bottom <= root.bottom
  })).toBe(true)
}

test('same-coordinate rejected editors describe only their own instance feedback', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 })
  await page.goto('/e2e/package-embedding/host.html')
  const first = page.locator('#first'), second = page.locator('#second')
  await expect(first.locator('td[data-cell="1:0"]')).toHaveText('Original')
  await expect(second.locator('td[data-cell="1:0"]')).toHaveText('Original')
  await second.getByRole('combobox', { name: 'Interface language' }).selectOption('zh')
  await first.locator('td[data-cell="1:0"]').dblclick()
  const firstEditor = first.locator('[data-cell-editor] textarea')
  await firstEditor.fill('=SUM(')
  await firstEditor.press('Enter')
  await expect(first.locator('.cell-editor-feedback')).toHaveText('That edit was not saved.')
  // 跨实例公式栏接收焦点后再编辑同一坐标，保留第一实例的失败草稿。
  await second.locator('[data-formula-input]').click()
  await second.locator('td[data-cell="1:0"]').dblclick()
  const secondEditor = second.locator('[data-cell-editor] textarea')
  await secondEditor.fill('=SUM(')
  await secondEditor.press('Enter')
  await expect(second.locator('.cell-editor-feedback')).toHaveText('此次编辑未保存。')
  const ids = await page.locator('[id]').evaluateAll(nodes => nodes.map(node => node.id))
  expect(new Set(ids).size).toBe(ids.length)
  for (const [sheet, editor, description] of [
    [first, firstEditor, 'That edit was not saved.'],
    [second, secondEditor, '此次编辑未保存。'],
  ] as const) {
    const id = await editor.getAttribute('id')
    expect(id).toMatch(/^cell-editor-.+-r1-c0$/)
    await expect(editor).toHaveAttribute('name', id!)
    await expect(editor).toHaveAccessibleDescription(description)
    expect(await editor.evaluate(node => {
      const feedback = document.getElementById(node.getAttribute('aria-describedby')!)
      return feedback?.closest('.einfach-spreadsheet') === node.closest('.einfach-spreadsheet')
    })).toBe(true)
    await expect(editor).toHaveValue('=SUM(')
    await expect(sheet.locator('td[data-cell="1:0"]')).toHaveText('Original')
    await expect(sheet.locator('td[data-cell="1:1"]')).toHaveText('Neighbor')
  }
  await expect(secondEditor).toBeFocused()
  await page.screenshot({ path: `${artifactDirectory}/r1-rejected-editors-1280.png` })
})

for (const width of [1280, 390]) {
  test(`formula assistance follows host-only resizing without moving sibling or document at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/e2e/package-embedding/host.html')
    const first = page.locator('#first'), second = page.locator('#second')
    await expect(first.locator('td[data-cell="1:0"]')).toHaveText('Original')
    await expect(second.locator('td[data-cell="1:0"]')).toHaveText('Original')
    await first.locator('td[data-cell="1:0"]').dblclick()
    const editor = first.locator('[data-cell-editor] textarea')
    await editor.fill('=SU')
    await expect(first.getByRole('listbox', { name: 'Formula functions' })).toBeVisible()
    await expectPopupInside(first)
    const scroll = await scrollPositions(page)
    const viewport = await page.evaluate(() => [window.innerWidth, window.innerHeight])
    // 只变宿主布局；不发送 window resize，也不改草稿来触发 React 重绘。
    await first.evaluate(node => { (node as HTMLElement).style.height = '400px' })
    await expect(first.locator('.workbook')).toHaveCSS('height', '400px')
    await expectPopupInside(first)
    await expect(editor).toHaveValue('=SU')
    await expect(editor).toBeFocused()
    await first.evaluate((node, size) => { (node as HTMLElement).style.width = `${size}px` },
      width === 1280 ? 360 : 280)
    await expectPopupInside(first)
    await expect(editor).toHaveValue('=SU')
    await expect(editor).toBeFocused()
    expect(await page.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual(viewport)
    expect(await scrollPositions(page)).toEqual(scroll)
    await expect(second.locator('.formula-assist')).toHaveCount(0)
    await page.screenshot({ path: `${artifactDirectory}/r1-container-resize-${width}.png` })
    await first.getByRole('listbox', { name: 'Formula functions' })
      .getByRole('option', { name: /^SUM / }).click()
    await expect(editor).toHaveValue('=SUM(')
    await expect(editor).toBeFocused()
    await editor.fill('=SUM(1,2)')
    await editor.press('Enter')
    await expect(first.locator('td[data-cell="1:0"]')).toHaveText('3')
    await expect(first.locator('td[data-cell="1:1"]')).toHaveText('Neighbor')
    await expect(second.locator('td[data-cell="1:0"]')).toHaveText('Original')
    expect(await scrollPositions(page)).toEqual(scroll)
  })
}
