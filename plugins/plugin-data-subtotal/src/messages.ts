import type { MessageDescriptor, Messages } from '@lingui/core'

const pairs = {
  title: ['Subtotal', '分类汇总'],
  list: ['List range', '列表区域'],
  group: ['At each change in', '分类字段'],
  function: ['Use function', '汇总方式'],
  fields: ['Add subtotal to', '汇总字段'],
  replace: ['Replace current subtotals', '替换当前分类汇总'],
  below: ['Summary below data', '汇总结果显示在数据下方'],
  apply: ['Apply subtotals', '应用分类汇总'],
  remove: ['Remove all', '全部删除'],
  refresh: ['Read list again', '重新读取列表'],
  cancel: ['Cancel', '取消'],
  working: ['Working…', '处理中…'],
  suffix: [' Total', ' 小计'],
  grand: ['Grand Total', '总计'],
  average: ['Average', '平均值'],
  countNumbers: ['Count numbers', '数值计数'],
  count: ['Count', '计数'],
  max: ['Maximum', '最大值'],
  min: ['Minimum', '最小值'],
  product: ['Product', '乘积'],
  sampleStandardDeviation: ['Sample standard deviation', '样本标准差'],
  populationStandardDeviation: ['Population standard deviation', '总体标准差'],
  sum: ['Sum', '求和'],
  sampleVariance: ['Sample variance', '样本方差'],
  populationVariance: ['Population variance', '总体方差'],
  changed: ['The workbook changed. Read the subtotal list again.', '工作簿已变更，请重新读取列表。'],
  table: ['Convert the Table to a normal range before inserting subtotals.', '请将表格转换为普通区域，再插入分类汇总。'],
  edited: ['A generated subtotal row contains edited content. Review that row before replacing or removing subtotals.',
    '生成的小计行含有编辑过的内容。请检查该行后再替换或删除分类汇总。'],
  validationLoss: ['Removing these subtotal rows would delete a data validation rule.',
    '移除这些小计行会删除一条数据验证规则。'],
  conditionalLoss: ['Removing these subtotal rows would delete a conditional formatting rule.',
    '移除这些小计行会删除一条条件格式规则。'],
  settingsLoss: ['Removing these subtotal rows would delete independent worksheet settings.',
    '移除这些小计行会删除独立的工作表设置。'],
  listError: ['Choose a list with headings and detail rows within the worksheet.', '请选择工作表内含标题和明细行的列表。'],
  alreadyIncluded: ['This subtotal calculation is already included.', '当前分类汇总已包含此统计项。'],
  headingsError: ['Use nonempty, distinct headings in the subtotal list.', '分类汇总列表的标题行不能为空且不能重复。'],
  detailsError: ['Choose a list containing detail records.', '请选择包含明细记录的列表。'],
  mergeSpillError: ['Choose a subtotal range without merged cells or spilled formulas.', '请选择不含合并单元格或溢出公式的分类汇总区域。'],
  replacePositionError: ['Replace the current subtotals to change the group fields or summary position.', '请替换当前分类汇总后再更改分类字段或汇总位置。'],
  groupingChangedError: ['The detail grouping changed. Replace the current subtotals to rebuild the groups.', '明细分组已变化，请替换当前分类汇总以重建分组。'],
  tableOverlapError: ['A generated subtotal row would change an existing Table.', '生成的小计行会影响现有表格。'],
  occupiedError: ['A subtotal output cell is occupied.', '分类汇总目标单元格已有内容。'],
  depthError: ['Subtotals support at most 7 grouping levels.', '分类汇总最多支持 7 层分组。'],
  overlapRowsError: ['Choose a subtotal list on different rows from the existing subtotals.', '请选择与现有分类汇总不在同一行区间的列表。'],
  maxCellsError: ['Choose a subtotal list of at most 100,000 cells.', '请选择不超过 100,000 个单元格的分类汇总列表。'],
} as const

type Label = keyof typeof pairs

export const subtotalLabels = Object.fromEntries(Object.entries(pairs).map(([id, [message]]) =>
  [id, { id: `subtotal.${id}`, message }])) as Record<Label, MessageDescriptor>
export const subtotalErrors = [subtotalLabels.changed, subtotalLabels.table, subtotalLabels.edited,
  subtotalLabels.listError, subtotalLabels.validationLoss, subtotalLabels.conditionalLoss,
  subtotalLabels.settingsLoss, subtotalLabels.alreadyIncluded, subtotalLabels.headingsError,
  subtotalLabels.detailsError, subtotalLabels.mergeSpillError, subtotalLabels.replacePositionError,
  subtotalLabels.groupingChangedError, subtotalLabels.tableOverlapError,
  subtotalLabels.occupiedError, subtotalLabels.depthError, subtotalLabels.overlapRowsError,
  subtotalLabels.maxCellsError] as const

function catalog(locale: 0 | 1): Messages {
  return Object.fromEntries(Object.entries(pairs).map(([id, values]) =>
    [subtotalLabels[id as Label].id!, [values[locale]]])) as Messages
}

export const subtotalMessages = { en: catalog(0), zh: catalog(1) }
