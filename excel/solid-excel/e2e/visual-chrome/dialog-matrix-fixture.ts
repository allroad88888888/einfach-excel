import { expect, type Page } from '@playwright/test'

import { guardConsoleErrors, withEnglishLocale } from '../helpers'
import type { ModalSurface } from './dialog-inventory'

export type DialogTheme = 'light' | 'dark'

export async function gotoDialogMatrix(page: Page) {
  guardConsoleErrors(page)
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
}

export async function mountModalProbe(page: Page, surface: ModalSurface) {
  await page.evaluate((entry) => {
    document.querySelector('[data-testid="dialog-matrix-probe"]')?.remove()
    const host = document.querySelector<HTMLElement>('.vnext-demo')!
    const root = document.createElement('section')
    root.className = entry.rootClass
    root.dataset.testid = 'dialog-matrix-probe'
    root.dataset.surfaceId = entry.id
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    root.setAttribute('aria-label', entry.name)
    if (entry.anchored) {
      root.style.top = '84px'
      root.style.left = '112px'
    }

    const header = document.createElement('header')
    header.className = entry.headerClass
    header.innerHTML = `<h2>${entry.name}</h2><button class="dialog-close-x" type="button">×</button>`

    const body = document.createElement('main')
    body.innerHTML = '<label>Value <input data-testid="dialog-matrix-input" /></label>'

    const footer = document.createElement('footer')
    footer.className = entry.footerClass
    const cancel = document.createElement('button')
    cancel.className = entry.controlClass
    cancel.type = 'button'
    cancel.textContent = 'Cancel'
    footer.append(cancel)
    if (entry.hasPrimary !== false) {
      const primary = document.createElement('button')
      primary.className = `${entry.controlClass} dialog-matrix-primary`
      primary.type = 'button'
      primary.dataset.variant = 'primary'
      primary.textContent = 'Save'
      footer.append(primary)
    }

    root.append(header, body, footer)
    host.append(root)
  }, surface)
}

export async function readModalMetrics(page: Page, theme: DialogTheme) {
  return page.getByTestId('dialog-matrix-probe').evaluate((root, nextTheme) => {
    const host = root.closest<HTMLElement>('.vnext-demo, .demo-page')!
    if (nextTheme === 'dark') host.dataset.spreadsheetTheme = 'dark'
    else delete host.dataset.spreadsheetTheme

    const resolveColor = (token: string) => {
      const sample = document.createElement('span')
      sample.style.color = `var(${token})`
      root.append(sample)
      const color = getComputedStyle(sample).color
      sample.remove()
      return color
    }
    const luminance = (color: string) => {
      const values = color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
      const channel = (value: number) => {
        const normalized = value / 255
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(values[0]) + 0.7152 * channel(values[1]) + 0.0722 * channel(values[2])
    }
    const contrast = (foreground: string, background: string) => {
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
      return (values[0] + 0.05) / (values[1] + 0.05)
    }

    const header = root.firstElementChild as HTMLElement
    const footer = root.lastElementChild as HTMLElement
    const input = root.querySelector<HTMLInputElement>('[data-testid="dialog-matrix-input"]')!
    const controls = [...root.querySelectorAll<HTMLElement>('button, input')]
    const primary = root.querySelector<HTMLElement>('[data-variant="primary"]')
    input.focus()

    const rootStyle = getComputedStyle(root)
    const inputStyle = getComputedStyle(input)
    const rootRect = root.getBoundingClientRect()
    const tokens = {
      border: resolveColor('--border'),
      focus: resolveColor('--office-blue'),
      overlay: resolveColor('--dialog-overlay'),
      primary: resolveColor('--dialog-primary-bg'),
      surface: resolveColor('--bg-surface'),
      text: resolveColor('--text-default'),
    }
    return {
      background: rootStyle.backgroundColor,
      borderColor: rootStyle.borderColor,
      borderRadius: rootStyle.borderRadius,
      borderWidth: rootStyle.borderWidth,
      centerOffset: Math.abs(rootRect.left + rootRect.width / 2 - innerWidth / 2),
      controlHeights: controls.map((control) => Math.round(control.getBoundingClientRect().height)),
      focusColor: inputStyle.outlineColor,
      focusWidth: inputStyle.outlineWidth,
      fontFamily: rootStyle.fontFamily,
      footerJustify: getComputedStyle(footer).justifyContent,
      headerHeight: Math.round(header.getBoundingClientRect().height),
      primaryBackground: primary ? getComputedStyle(primary).backgroundColor : null,
      primaryContrast: primary
        ? contrast(getComputedStyle(primary).color, getComputedStyle(primary).backgroundColor)
        : null,
      shadow: rootStyle.boxShadow,
      textColor: rootStyle.color,
      textContrast: contrast(rootStyle.color, rootStyle.backgroundColor),
      tokens,
      transform: rootStyle.transform,
      width: Math.round(rootRect.width),
    }
  }, theme)
}
