import { expect, test } from '@playwright/test'

for (const width of [1280, 390]) {
  test(`spill details and reopened dialog follow UI language at ${width}px`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/?locale=zh')
    await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
    await page.getByRole('tab', { name: '公式', exact: true }).click()
    await page.getByRole('button', { name: '溢出详情', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '溢出详情' })
    await expect(dialog).toContainText('此单元格不属于溢出数组。')
    await expect(dialog).toContainText('隐藏的行列保持隐藏，不会修改任何单元格。')
    await expect(dialog.getByRole('button', { name: '刷新', exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeFocused()
    await expect(dialog).not.toContainText(/Spill details|Refresh|Close/)
    await page.screenshot({ path: test.info().outputPath(`spill-zh-${width}.png`) })
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
    await page.getByRole('combobox', { name: '界面语言' }).selectOption('en')
    await page.getByRole('button', { name: 'Spill details', exact: true }).click()
    await expect(page.getByRole('dialog')).toContainText('This cell is not part of a spilled array.')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    expect(errors).toEqual([])
  })
}

const panels = [
  ['开始', '边框设置', '边框', '线条样式'],
  ['开始', '数字格式设置', '数字格式', '小数位数'],
  ['开始', '条件格式', '条件格式', '工作表规则'],
  ['公式', '名称管理器', '名称管理器', '引用位置'],
  ['公式', '插入函数', '插入函数', '搜索函数'],
  ['数据', '数据验证', '数据验证', '允许'],
  ['视图', '定位条件', '定位条件', '常量'],
  ['视图', '定位', '定位', '最近定位'],
  ['视图', '查找和替换', '查找和替换', '查找内容'],
  ['数据', '填充序列', '填充序列', '序列类型'],
  ['数据', '文本分列', '文本分列', '字段类型'],
  ['插入', '表格', '表格', '表格名称'],
  ['视图', '行高和列宽', '行高和列宽', '行高'],
  ['视图', '选区统计设置', '选区统计', '数值计数'],
  ['开始', '选择性粘贴', '选择性粘贴', '粘贴内容'],
] as const

for (const [tab, button, heading, copy] of panels) {
  test(`Chinese ${heading} has translated controls and accessible names`, async ({ page }) => {
    await page.goto('/?locale=zh')
    await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
    await page.getByRole('tab', { name: tab, exact: true }).click()
    await page.getByRole('button', { name: button, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: heading, exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(copy)
    if (button === '边框设置') {
      await expect(dialog.getByRole('option', { name: '双线', exact: true })).toHaveAttribute('value', 'double')
    }
    if (button === '文本分列') {
      await dialog.getByRole('combobox', { name: '字段类型', exact: true }).selectOption('dateMdy')
      await expect(dialog.getByRole('combobox', { name: '字段类型', exact: true })).toHaveValue('dateMdy')
      await expect(dialog.getByRole('option', { name: '日期 — 月日年', exact: true }))
        .toHaveAttribute('value', 'dateMdy')
    }
    if (button === '填充序列') {
      await expect(dialog.getByRole('option', { name: '日期序列', exact: true }))
        .toHaveAttribute('value', 'date')
    }
    if (button === '插入函数') {
      await expect(dialog.getByLabel('类别', { exact: true }).locator('option[value="Custom"]'))
        .toHaveText('自定义')
      await expect(dialog.getByLabel('类别', { exact: true }).locator('option[value="Linked content"]'))
        .toHaveText('链接内容')
      await dialog.getByLabel('类别', { exact: true }).selectOption('Math & statistics')
      await expect(dialog.getByLabel('类别', { exact: true })).toHaveValue('Math & statistics')
      await expect(dialog.getByRole('option', { name: '数学与统计', exact: true })).toHaveAttribute('value', 'Math & statistics')
      await dialog.getByLabel('函数', { exact: true }).selectOption('SUM')
      await expect(dialog.locator('[data-formula-help="SUM"] .formula-help-summary'))
        .toHaveText('求数字参数及区域中数字单元格的和。')
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })
}

test('Chinese validation rejection, recovery and history do not translate workbook content', async ({ page }) => {
  await page.goto('/?locale=zh')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  const name = page.getByRole('textbox', { name: '名称框', exact: true })
  await name.fill('H45')
  await name.press('Enter')
  const bar = page.getByRole('textbox', { name: '活动单元格内容', exact: true })
  await expect(bar).toBeEnabled()
  await bar.fill('5.5')
  await bar.press('Enter')
  await expect(page.getByRole('alert')).toContainText('此值不符合该单元格的数据验证规则')
  await expect(bar).toHaveValue('5.5')
  await bar.press('Escape')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(bar).toHaveValue('5')
  await bar.fill('8')
  await bar.press('Enter')
  await expect(page.locator('td[data-cell="44:7"]')).toHaveText('8')
  await page.getByRole('button', { name: '最近操作', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('编辑单元格')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.locator('td[data-cell="44:7"]')).toHaveText('5')
  await page.getByRole('combobox', { name: '界面语言' }).selectOption('en')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('5')
  await expect(page.getByRole('tab', { name: 'Summary', exact: true })).toBeVisible()
})
