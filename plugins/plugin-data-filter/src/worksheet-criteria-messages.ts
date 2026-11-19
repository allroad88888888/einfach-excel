import type { MessageDescriptor, Messages } from '@lingui/core'

const pairs = {
  title: ['Advanced filter', '高级筛选'],
  source: ['List range', '列表区域'],
  criteria: ['Criteria range', '条件区域'],
  inPlace: ['Filter the list in place', '在原区域筛选'],
  copy: ['Copy to another location', '将结果复制到其他位置'],
  destination: ['Copy to', '复制到'],
  fields: ['Output headings, one per line', '输出字段标题，每行一个'],
  unique: ['Unique records only', '仅保留唯一记录'],
  apply: ['Apply filter', '应用筛选'],
  preview: ['Preview results', '预览结果'],
  commit: ['Copy results', '复制结果'],
  cancel: ['Cancel', '取消'],
  working: ['Checking worksheet ranges…', '正在检查工作表区域…'],
  matchesOne: ['1 matching record', '匹配 1 条记录'],
  matches: ['{n} matching records', '匹配 {n} 条记录'],
  overwriteOne: ['Overwrite 1 occupied cell', '覆盖 1 个已有内容的单元格'],
  overwrite: ['Overwrite {n} occupied cells', '覆盖 {n} 个已有内容的单元格'],
  limited: ['Showing part of the output.', '这里只显示部分输出。'],
} as const

type Label = keyof typeof pairs

export const criteriaLabels = Object.fromEntries(
  Object.entries(pairs).map(([key, [message]]) => [key, { id: `dataFilter.worksheet.${key}`, message }]),
) as Record<Label, MessageDescriptor>

function catalog(locale: 0 | 1): Messages {
  return Object.fromEntries(Object.entries(pairs).map(([key, values]) => [
    criteriaLabels[key as Label].id!, values[locale].split(/(\{\w+\})/).filter(Boolean).map(part =>
      part.startsWith('{') ? [part.slice(1, -1)] : part),
  ])) as Messages
}

export const worksheetCriteriaMessages = { en: catalog(0), zh: catalog(1) }
