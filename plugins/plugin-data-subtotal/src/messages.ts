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
} as const

type Label = keyof typeof pairs

export const subtotalLabels = Object.fromEntries(Object.entries(pairs).map(([id, [message]]) =>
  [id, { id: `subtotal.${id}`, message }])) as Record<Label, MessageDescriptor>
export const subtotalErrors = [subtotalLabels.changed, subtotalLabels.table, subtotalLabels.edited,
  subtotalLabels.listError, subtotalLabels.validationLoss, subtotalLabels.conditionalLoss,
  subtotalLabels.settingsLoss] as const

function catalog(locale: 0 | 1): Messages {
  return Object.fromEntries(Object.entries(pairs).map(([id, values]) =>
    [subtotalLabels[id as Label].id!, [values[locale]]])) as Messages
}

export const subtotalMessages = { en: catalog(0), zh: catalog(1) }
