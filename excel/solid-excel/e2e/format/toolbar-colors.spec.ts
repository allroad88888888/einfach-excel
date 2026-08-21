import { expect, test, type Page } from '@playwright/test'
import { cell, cellDisplay, withEnglishLocale } from '../helpers'

type ColorMode = 'fill' | 'text'

const COLOR_BUTTONS = [
  {
    mode: 'fill',
    testId: 'toolbar-btn-fill-color',
    rawKey: 'toolbar.fillColor.title',
  },
  {
    mode: 'text',
    testId: 'toolbar-btn-text-color',
    rawKey: 'toolbar.textColor.title',
  },
] as const

async function gotoWave5(page: Page) {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
}

function colorButton(page: Page, mode: ColorMode) {
  return page.getByTestId(mode === 'fill' ? 'toolbar-btn-fill-color' : 'toolbar-btn-text-color')
}

function colorPopover(page: Page) {
  return page.getByTestId('toolbar-color-popover')
}

function colorSwatch(page: Page, hex: string) {
  return page.getByTestId(`color-popover-swatch-${hex}`)
}

function noFillButton(page: Page) {
  return page.getByTestId('color-popover-no-fill')
}

async function expectActiveCellCanvas(page: Page, addr: string) {
  const target = cell(page, addr)
  await expect(target).toHaveAttribute('data-active', 'true')
  await expect(target).toHaveCSS('background-color', 'rgb(255, 255, 255)')
}

async function readPaint(page: Page, addr: string) {
  return cell(page, addr).evaluate((el) => {
    const display = el.querySelector('.cell-display') as HTMLElement | null
    const displayStyle = display ? getComputedStyle(display) : null
    return {
      displayBackground: displayStyle?.backgroundColor ?? '',
      displayColor: displayStyle?.color ?? '',
    }
  })
}

function expectLocalizedLabel(actual: string | null, rawKey: string) {
  const value = actual ?? ''
  expect(value).toBeTruthy()
  expect(value).not.toBe(rawKey)
  expect(value).not.toContain('toolbar.')
}

test.describe('Wave 5 toolbar color buttons', () => {
  for (const scenario of COLOR_BUTTONS) {
    test(`${scenario.mode} color button is visible, localized, and opens the color popover`, async ({
      page,
    }) => {
      await gotoWave5(page)
      await cell(page, 'B2').click()

      const button = page.getByTestId(scenario.testId)
      await expect(button).toBeVisible()
      await expect(button).toBeEnabled()
      expectLocalizedLabel(await button.getAttribute('aria-label'), scenario.rawKey)
      expectLocalizedLabel(await button.getAttribute('data-tooltip'), scenario.rawKey)

      await button.click()

      const popover = colorPopover(page)
      await expect(popover).toBeVisible()
      await expect(popover).toHaveAttribute('data-mode', scenario.mode)
      await expect(button).toHaveAttribute('aria-expanded', 'true')
    })
  }
})

test.describe('Wave 5 toolbar color swatches', () => {
  test('fill swatch updates td background and propagates the tint to the cell-display', async ({
    page,
  }) => {
    await gotoWave5(page)
    const target = 'B2'
    await cell(page, target).click()

    const before = await readPaint(page, target)

    await colorButton(page, 'fill').click()
    const popover = colorPopover(page)
    await expect(popover).toHaveAttribute('data-mode', 'fill')

    await colorSwatch(page, '#ffd966').click()

    await expect(popover).toBeHidden()
    await expect(cell(page, target)).toHaveCSS('background-color', 'rgb(255, 217, 102)')
    // The .cell-display span used to render transparent so the TD's bgColor
    // could bleed through the 6px padding strip. Wave 5 forces the span to
    // inherit the parent TD's `background-color` via CSS so the same tint
    // covers both the padding strip and the text run — see
    // `excel/solid-excel/src/styles.css`.
    await expect(cellDisplay(page, target)).toHaveCSS(
      'background-color',
      'rgb(255, 217, 102)',
    )
    await expect(cellDisplay(page, target)).toHaveCSS('color', before.displayColor)
  })

  test('text swatch updates the cell-display color and leaves the td background untouched', async ({
    page,
  }) => {
    await gotoWave5(page)
    const target = 'B3'
    await cell(page, target).click()

    const before = await readPaint(page, target)

    await colorButton(page, 'text').click()
    const popover = colorPopover(page)
    await expect(popover).toHaveAttribute('data-mode', 'text')

    await colorSwatch(page, '#ff0000').click()

    await expect(popover).toBeHidden()
    await expect(cellDisplay(page, target)).toHaveCSS('color', 'rgb(255, 0, 0)')
    // The active cell intentionally uses the canvas surface; its outline is
    // rendered by the selection overlay rather than a tinted cell background.
    await expectActiveCellCanvas(page, target)
    await expect(cellDisplay(page, target)).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  })
})

test.describe('Wave 5 toolbar color popover reset behavior', () => {
  test('color-popover-no-fill clears fill and restores automatic text color', async ({ page }) => {
    await gotoWave5(page)

    const fillTarget = 'B2'
    await cell(page, fillTarget).click()
    const fillBefore = await readPaint(page, fillTarget)

    await colorButton(page, 'fill').click()
    const popover = colorPopover(page)
    await expect(popover).toHaveAttribute('data-mode', 'fill')
    await noFillButton(page).click()

    await expect(popover).toBeHidden()
    await expectActiveCellCanvas(page, fillTarget)
    await expect(cellDisplay(page, fillTarget)).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(cellDisplay(page, fillTarget)).toHaveCSS('color', fillBefore.displayColor)

    const textTarget = 'B3'
    await cell(page, textTarget).click()
    const textBefore = await readPaint(page, textTarget)

    await colorButton(page, 'text').click()
    await expect(popover).toHaveAttribute('data-mode', 'text')
    await colorSwatch(page, '#ff0000').click()
    await expect(popover).toBeHidden()
    await expect(cellDisplay(page, textTarget)).toHaveCSS('color', 'rgb(255, 0, 0)')

    await colorButton(page, 'text').click()
    await expect(popover).toHaveAttribute('data-mode', 'text')
    await noFillButton(page).click()

    await expect(popover).toBeHidden()
    await expect(cellDisplay(page, textTarget)).toHaveCSS('color', textBefore.displayColor)
  })

  test('Escape and outside click close the color popover without changing the cell', async ({
    page,
  }) => {
    await gotoWave5(page)

    const fillTarget = 'B2'
    await cell(page, fillTarget).click()
    const fillBefore = await readPaint(page, fillTarget)

    await colorButton(page, 'fill').click()
    const popover = colorPopover(page)
    await expect(popover).toHaveAttribute('data-mode', 'fill')

    await page.keyboard.press('Escape')

    await expect(popover).toBeHidden()
    await expectActiveCellCanvas(page, fillTarget)
    await expect(cellDisplay(page, fillTarget)).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(cellDisplay(page, fillTarget)).toHaveCSS('color', fillBefore.displayColor)

    const textTarget = 'B3'
    await cell(page, textTarget).click()
    const textBefore = await readPaint(page, textTarget)

    await colorButton(page, 'text').click()
    await expect(popover).toHaveAttribute('data-mode', 'text')

    await page.mouse.click(10, 10)

    await expect(popover).toBeHidden()
    await expectActiveCellCanvas(page, textTarget)
    await expect(cellDisplay(page, textTarget)).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(cellDisplay(page, textTarget)).toHaveCSS('color', textBefore.displayColor)
  })
})
