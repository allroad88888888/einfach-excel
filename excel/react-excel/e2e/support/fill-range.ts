import { expect, type Page } from '@playwright/test'
import { select } from './clipboard'

/** 使用当前订单种子；先通过 UI 取消压力演示合并，再测试千行连续范围填充。 */
export async function unmergeSalesFillRange(page: Page) {
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await select(page, 'A2:A1001', '1:0')
  const name = page.getByRole('textbox', { name: 'Name box' })
  // 与演示合并区相交时，选择扩展是正确行为，不应改业务逻辑来迁就旧测试。
  await expect(name).toHaveValue('A2:DX1001')
  const merge = page.getByRole('combobox', { name: 'Merge cells', exact: true })
  await merge.selectOption('unmerge')
  await expect(merge).toBeEnabled()
  await select(page, 'A2:A1001', '1:0')
  await expect(name).toHaveValue('A2:A1001')
}
