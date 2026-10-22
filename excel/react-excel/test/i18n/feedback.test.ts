import { afterEach, expect, test } from 'vitest'
import { activateUiLocale, i18n } from '../../src/page/demo/demo-presentation'
import { translateFeedback } from '../../src/i18n/translate-feedback'
import { createWorkbookI18n } from '../../src/i18n/runtime'

afterEach(() => activateUiLocale('en'))

test.each([
  ['HOST_READ_ONLY', 'This workbook is read-only.', '此工作簿为只读。'],
  ['HOST_BUSY', 'The workbook is busy. Try again when it is ready.', '工作簿正忙，请在就绪后重试。'],
  ['HOST_STRUCTURE_DISABLED', 'Worksheet structure changes are disabled.', '已禁用工作表结构修改。'],
])('renders the known host policy code %s as bilingual user feedback', (code, english, chinese) => {
  expect(translateFeedback(createWorkbookI18n('en'), code)).toBe(english)
  expect(translateFeedback(createWorkbookI18n('zh'), code)).toBe(chinese)
  expect(translateFeedback(createWorkbookI18n('zh'), 'HOST_UNKNOWN')).toBe('HOST_UNKNOWN')
})

test.each([
  ['That edit was not saved.', '此次编辑未保存。'],
  ['Pasted cells.', '已粘贴单元格。'],
  ['Enter a name or cell address.', '请输入名称或单元格地址。'],
  ['Spill details are out of date. Refresh to try again.', '溢出详情已过期，请刷新后重试。'],
  ['Numerical count', '数值计数'],
  ['Math & statistics', '数学与统计'],
  ['Custom', '自定义'],
  ['Linked content', '链接内容'],
  ['Returns a positive square root.', '返回正平方根。'],
  ['Copied 2 × 3 cells.', '已复制 2 × 3 个单元格。'],
  ['Copied 2 × 3 cells as html.', '已将 2 × 3 个单元格复制为 html。'],
  ['2 × 3 cells ready to move. Paste to finish.', '2 × 3 个单元格已准备移动，请粘贴以完成。'],
  ['Sorted 18 rows.', '已排序 18 行。'],
  ['Copied Sum.', '已复制求和。'],
  ['Workbook recalculated (12 formulas).', '已重新计算工作簿（12 个公式）。'],
  ['Worksheet recalculated (2 formulas).', '已重新计算工作表（2 个公式）。'],
  ['Filled right.', '已向右填充。'],
  ['Filling down…', '正在向下填充…'],
  ['No adjacent continuous data to fill.', '相邻列没有可向下延续的连续数据。'],
  ['Enter a whole number from 1 to 500 pixels.', '请输入 1–500 像素之间的整数。'],
  ['Math & statistics. Argument help is not available yet.', '数学与统计。暂未提供参数说明。'],
  ['This is not a valid .einfach.json workbook file. Current workbook kept.',
    '这不是有效的 .einfach.json 工作簿文件。 当前工作簿已保留。'],
])('translates existing Core feedback without altering its source: %s', (source, chinese) => {
  activateUiLocale('zh')
  expect(translateFeedback(i18n, source)).toBe(chinese)
  activateUiLocale('en')
  expect(translateFeedback(i18n, source)).toBe(source)
})

test('preserves unknown diagnostics, multiline details, and empty feedback', () => {
  activateUiLocale('zh')
  const detail = 'Native failure: customer Order-123\nUnexpected revision 42'
  expect(translateFeedback(i18n, detail)).toBe(detail)
  expect(translateFeedback(i18n, 'Copied 2 × X cells.')).toBe('Copied 2 × X cells.')
  expect(translateFeedback(i18n, '__proto__')).toBe('__proto__')
  expect(translateFeedback(i18n, null)).toBe('')
  expect(translateFeedback(i18n, undefined)).toBe('')
})
