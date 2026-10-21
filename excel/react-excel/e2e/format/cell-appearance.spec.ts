import { expect, test, type Locator, type Page } from '@playwright/test'

async function selectedCell(page: Page): Promise<Locator> {
  await page.goto('/')
  const cell = page.locator('td[data-cell="2:0"]')
  await expect(cell).toBeVisible()
  await cell.click()
  return cell
}

test('Fill color reapplies the last color and No fill clears it explicitly', async ({ page }) => {
  const cell = await selectedCell(page)
  const button = page.getByRole('button', { name: 'Fill color', exact: true })
  const initial = await cell.evaluate((element) => getComputedStyle(element).backgroundColor)

  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(cell).toHaveCSS('background-color', 'rgb(255, 242, 204)')
  await button.click()
  await expect(cell).toHaveCSS('background-color', 'rgb(255, 242, 204)')
  await page.getByRole('button', { name: 'Choose fill color' }).click()
  await page.getByRole('button', { name: 'No fill', exact: true }).click()
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  await expect(cell).toHaveCSS('background-color', initial)
})

test('Text color reapplies the last color and Automatic clears it explicitly', async ({ page }) => {
  const cell = await selectedCell(page)
  const button = page.getByRole('button', { name: 'Text color', exact: true })
  const initial = await cell.evaluate((element) => getComputedStyle(element).color)

  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(cell).toHaveCSS('color', 'rgb(192, 0, 0)')
  await button.click()
  await expect(cell).toHaveCSS('color', 'rgb(192, 0, 0)')
  await page.getByRole('button', { name: 'Choose text color' }).click()
  await page.getByRole('button', { name: 'Automatic text color' }).click()
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  await expect(cell).toHaveCSS('color', initial)
})

test('Horizontal alignment selects center, right and left through Rust', async ({ page }) => {
  const cell = await selectedCell(page)
  const control = page.getByRole('combobox', { name: 'Horizontal alignment' })

  for (const alignment of ['center', 'right', 'left']) {
    await control.selectOption(alignment)
    await expect(cell).toHaveCSS('text-align', alignment)
  }
})

test('Vertical alignment selects top, center and bottom through Rust', async ({ page }) => {
  const cell = await selectedCell(page)
  const control = page.getByRole('combobox', { name: 'Vertical alignment' })

  for (const alignment of ['top', 'middle', 'bottom']) {
    await control.selectOption(alignment === 'middle' ? 'center' : alignment)
    await expect(cell).toHaveCSS('vertical-align', alignment)
  }
})

test('Text rotation selects clockwise, counterclockwise and off through Rust', async ({ page }) => {
  const cell = await selectedCell(page)
  const control = page.getByRole('combobox', { name: 'Text rotation' })

  await control.selectOption('45')
  await expect(cell.locator('.cell-rotated-text')).toHaveAttribute('style', /rotate\(45deg\)/)
  await control.selectOption('-45')
  await expect(cell.locator('.cell-rotated-text')).toHaveAttribute('style', /rotate\(-45deg\)/)
  await control.selectOption('0')
  await expect(cell.locator('.cell-rotated-text')).toHaveCount(0)
})

test('Borders toggles thin borders through Rust', async ({ page }) => {
  const cell = await selectedCell(page)
  const button = page.getByRole('button', { name: 'Borders' })

  await button.click()
  await expect(cell).toHaveCSS('border-top-style', 'solid')
  await expect(cell).toHaveCSS('border-top-width', '0px')
  await expect(cell).toHaveCSS('border-top-color', 'rgb(127, 127, 127)')
  const above = page.locator('td[data-cell="1:0"]')
  await expect(above).toHaveCSS('border-bottom-width', '1px')
  await expect(above).toHaveCSS('border-bottom-color', 'rgb(127, 127, 127)')
  await expect(page.locator('td[data-cell="2:1"]')).toHaveText('Northwind')
  await expect(cell).toHaveText('SO-10002')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(above).not.toHaveCSS('border-bottom-color', 'rgb(127, 127, 127)')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(above).toHaveCSS('border-bottom-color', 'rgb(127, 127, 127)')
  await button.click()
  await expect(cell).toHaveCSS('border-top-style', 'none')
  await expect(above).not.toHaveCSS('border-bottom-color', 'rgb(127, 127, 127)')
})

test('shows the second format batch in the original Rust seed', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:3"]')).toHaveCSS(
    'background-color',
    'rgb(255, 242, 204)',
  )
  await expect(page.locator('td[data-cell="1:4"]')).toHaveCSS('color', 'rgb(192, 0, 0)')
  await expect(page.locator('td[data-cell="1:5"]')).toHaveCSS('text-align', 'center')
  const nameBox = page.getByRole('textbox', { name: 'Name box' })
  await nameBox.fill('J2')
  await nameBox.press('Enter')
  await expect(page.locator('td[data-cell="1:9"]')).toHaveCSS('vertical-align', 'top')
  await nameBox.fill('K2')
  await nameBox.press('Enter')
  await expect(page.locator('td[data-cell="1:10"] .cell-rotated-text')).toHaveAttribute(
    'style',
    /rotate\(45deg\)/,
  )
  await nameBox.fill('L2')
  await nameBox.press('Enter')
  await expect(page.locator('td[data-cell="1:11"]')).toHaveCSS('border-top-style', 'solid')
})

for (const width of [1280, 390]) test.describe(`${width}px horizontal alignment choices`, () => {
  test.use({ viewport: { width, height: 850 } })

  for (const alignment of ['left', 'center', 'right']) {
    test(`horizontal ${alignment} is an independent undoable choice at ${width}px`, async ({ page }) => {
      const target = await selectedCell(page)
      const control = page.getByRole('combobox', { name: 'Horizontal alignment', exact: true })
      const neighbor = page.locator('td[data-cell="3:0"]')
      const original = await target.evaluate(node => getComputedStyle(node).textAlign)
      const outside = await neighbor.evaluate(node => getComputedStyle(node).textAlign)
      const text = await target.innerText()
      await control.selectOption(alignment)
      await expect(control).toHaveValue(alignment)
      await expect(target).toHaveCSS('text-align', alignment)
      await expect(neighbor).toHaveCSS('text-align', outside)
      await expect(target).toHaveText(text)
      await page.getByRole('button', { name: 'Undo', exact: true }).click()
      await expect(control).toHaveValue('default')
      await expect(target).toHaveCSS('text-align', original)
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
      await page.getByRole('button', { name: 'Redo', exact: true }).click()
      await expect(control).toHaveValue(alignment)
      await expect(target).toHaveCSS('text-align', alignment)
    })
  }
})

for (const width of [1280, 390]) test.describe(`${width}px vertical alignment choices`, () => {
  test.use({ viewport: { width, height: 850 } })

  for (const alignment of ['top', 'center', 'bottom']) {
    test(`vertical ${alignment} is an independent undoable choice at ${width}px`, async ({ page }) => {
      const target = await selectedCell(page)
      const control = page.getByRole('combobox', { name: 'Vertical alignment', exact: true })
      const neighbor = page.locator('td[data-cell="3:0"]')
      const original = await target.evaluate(node => getComputedStyle(node).verticalAlign)
      const outside = await neighbor.evaluate(node => getComputedStyle(node).verticalAlign)
      const text = await target.innerText()
      const css = alignment === 'center' ? 'middle' : alignment
      await control.selectOption(alignment)
      await expect(control).toHaveValue(alignment)
      await expect(target).toHaveCSS('vertical-align', css)
      await expect(neighbor).toHaveCSS('vertical-align', outside)
      await expect(target).toHaveText(text)
      await page.getByRole('button', { name: 'Undo', exact: true }).click()
      await expect(control).toHaveValue('default')
      await expect(target).toHaveCSS('vertical-align', original)
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
      await page.getByRole('button', { name: 'Redo', exact: true }).click()
      await expect(control).toHaveValue(alignment)
      await expect(target).toHaveCSS('vertical-align', css)
    })
  }
})

for (const width of [1280, 390]) test.describe(`${width}px rotation choices`, () => {
  test.use({ viewport: { width, height: 850 } })

  for (const angle of [-90, -45, 45, 90, 'vertical'] as const) {
    test(`rotation ${angle} preserves cell data and undoes once at ${width}px`, async ({ page }) => {
      const target = await selectedCell(page)
      const control = page.getByRole('combobox', { name: 'Text rotation', exact: true })
      const before = await target.innerText()
      const size = await target.boundingBox()
      await control.selectOption(String(angle))
      await expect(control).toHaveValue(String(angle))
      if (angle === 'vertical') {
        await expect(target.locator('.cell-rotated-text')).toHaveCSS('writing-mode', 'vertical-rl')
        await expect(target.locator('.cell-rotated-text')).toHaveCSS('text-orientation', 'upright')
      } else await expect(target.locator('.cell-rotated-text')).toHaveAttribute('style', new RegExp(`rotate\\(${angle}deg\\)`))
      await expect(target).toHaveText(before)
      await expect(page.locator('td[data-cell="3:0"] .cell-rotated-text')).toHaveCount(0)
      expect((await target.boundingBox())?.height).toBe(size?.height)
      expect((await target.boundingBox())?.width).toBe(size?.width)
      await page.getByRole('button', { name: 'Undo', exact: true }).click()
      await expect(control).toHaveValue('0')
      await expect(target.locator('.cell-rotated-text')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
      await page.getByRole('button', { name: 'Redo', exact: true }).click()
      await expect(control).toHaveValue(String(angle))
      if (angle === 'vertical') {
        await expect(target.locator('.cell-rotated-text')).toHaveCSS('writing-mode', 'vertical-rl')
        await expect(target.locator('.cell-rotated-text')).toHaveCSS('text-orientation', 'upright')
      } else await expect(target.locator('.cell-rotated-text')).toHaveAttribute('style', new RegExp(`rotate\\(${angle}deg\\)`))
    })
  }
})
