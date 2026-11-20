import type { Messages } from '@lingui/core'

const descriptions = {
  title: ['Sort left to right', '从左到右排序'],
  hint: ['Move the selected columns by one or more row keys. Hidden columns stay in place.',
    '按一个或多个行键移动选中区域内的列。隐藏列保持原位。'],
  stale: ['The selection changed. Close and reopen Sort left to right.',
    '选区已改变。请关闭后重新打开从左到右排序。'],
  row: ['Sort row {level}', '排序行 {level}'],
  left: ['On left', '放在左侧'],
  right: ['On right', '放在右侧'],
  table: ['Convert the table to a range before sorting left to right.', '请先将表格转换为普通区域，再从左到右排序。'],
  filter: ['Clear the active filter before sorting this range left to right.', '请清除活动筛选后再从左到右排序。'],
  columns: ['Select at least two data columns. Include all rows to move together.',
    '请至少选择两列，并将需要一起移动的所有行纳入选区。'],
  rows: ['Choose 1–8 different rows inside the selected range.', '请在选区内选择 1 至 8 个不同的行键。'],
} as const

type Key = keyof typeof descriptions
export const horizontalLabels = Object.fromEntries(Object.entries(descriptions).map(
  ([key, [message]]) => [key, { id: `plugin.dataSort.horizontal.${key}`, message }],
)) as Record<Key, { id: string; message: string }>

export const horizontalMessages = (locale: 'en' | 'zh'): Messages => ({
  ...Object.fromEntries((Object.keys(descriptions) as Key[]).map(key => [
    horizontalLabels[key].id, descriptions[key][locale === 'en' ? 0 : 1],
  ])),
  [horizontalLabels.row.id]: locale === 'en' ? ['Sort row ', ['level']] : ['排序行 ', ['level']],
})

export function horizontalError(message: string) {
  return (['table', 'filter', 'columns', 'rows'] as const)
    .map(key => horizontalLabels[key]).find(label => label.message === message)
}
