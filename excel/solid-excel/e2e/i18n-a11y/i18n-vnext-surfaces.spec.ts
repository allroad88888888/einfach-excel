import { expect, test, type Page } from '@playwright/test'

import { expectNoConsoleErrors, gotoRoot, guardConsoleErrors, withEnglishLocale } from '../helpers'

/**
 * i18n 在 vNext 表面上的覆盖：存量 i18n.spec.ts 只测 legacy Blank/Formulas
 * demo，这里补 wave5 菜单栏/工具栏/对话框与 vNext Worker demo。
 *
 * 关键点：
 *   - locale 切换是全局的（lingui i18n.activate + localeAtom），wave5 的
 *     `useT()` 站点必须同 tick 重译。
 *   - 打开中的对话框不能因重译而关闭或丢表单状态 —— find-replace 的表单
 *     状态在 spreadsheet-ui-core 的 findReplaceFormAtom 里，与渲染树解耦。
 *   - 文案基准取自 src/i18n/locales/{en,zh}.ts，断言只抽样公认 key，不
 *     反向复刻整个 catalog。
 */

function localeBtn(page: Page, label: 'EN' | '中') {
  return page.getByRole('button', { name: label, exact: true })
}

async function gotoWave5English(page: Page) {
  guardConsoleErrors(page)
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
}

test.describe('i18n — vNext 表面 locale 切换', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('wave5 菜单栏/工具栏/nav 标签文案随 locale 往返切换', async ({ page }) => {
    await gotoWave5English(page)

    const editMenu = page.getByTestId('menu-bar-button-edit')
    const findReplaceBtn = page.getByTestId('toolbar-btn-find-replace')
    const wave5Tab = page.getByTestId('nav-tab-vnext-wave5')

    await expect(editMenu).toHaveText('Edit')
    await expect(findReplaceBtn).toHaveAttribute('aria-label', 'Find and replace')
    await expect(wave5Tab).toHaveText('vNext Wave 5')

    await localeBtn(page, '中').click()
    await expect(editMenu).toHaveText('编辑')
    await expect(findReplaceBtn).toHaveAttribute('aria-label', '查找和替换')
    await expect(wave5Tab).toHaveText('Wave 5 完整版')

    await localeBtn(page, 'EN').click()
    await expect(editMenu).toHaveText('Edit')
    await expect(findReplaceBtn).toHaveAttribute('aria-label', 'Find and replace')
    await expect(wave5Tab).toHaveText('vNext Wave 5')
  })

  test('打开中的 find-replace 对话框文案跟随 locale 切换', async ({ page }) => {
    await gotoWave5English(page)

    await page.getByTestId('toolbar-btn-find-replace').click()
    const dialog = page.getByTestId('wave5-find-replace')
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-label', 'Find and replace')

    const needle = page.getByTestId('find-needle-input')
    await needle.fill('North')
    await expect(needle).toHaveValue('North')

    await localeBtn(page, '中').click()
    // 对话框不因重译关闭，标题与 tab 文案跟随，输入值保留。
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-label', '查找和替换')
    await expect(page.getByTestId('find-tab')).toHaveText('查找')
    await expect(needle).toHaveValue('North')

    await localeBtn(page, 'EN').click()
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-label', 'Find and replace')
    await expect(page.getByTestId('find-tab')).toHaveText('Find')
    await expect(needle).toHaveValue('North')
  })

  test('vNext Worker demo 默认 ZH 启动，切 EN 生效', async ({ page }) => {
    guardConsoleErrors(page)
    // 不带 locale 参数：App 以 DEFAULT_LOCALE=zh 启动（i18n/index.ts）。
    await gotoRoot(page)
    await page.getByRole('button', { name: 'vNext Worker', exact: true }).click()
    await expect(page.getByTestId('vnext-worker-grid')).toBeVisible({ timeout: 30_000 })

    const fileMenu = page.getByTestId('menu-bar-button-file')
    await expect(fileMenu).toHaveText('文件')

    await localeBtn(page, 'EN').click()
    await expect(fileMenu).toHaveText('File')

    await localeBtn(page, '中').click()
    await expect(fileMenu).toHaveText('文件')
  })
})
