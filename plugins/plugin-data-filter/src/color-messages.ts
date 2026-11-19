import type { MessageDescriptor, Messages } from '@lingui/core'

const pairs = {
  title: ['Color', '颜色'],
  activate: ['Filter by color…', '按颜色筛选…'],
  source: ['Color source {number}', '颜色来源 {number}'],
  fill: ['Cell fill', '单元格填充色'],
  font: ['Font color', '字体颜色'],
  noFill: ['No fill', '无填充'],
  automatic: ['Automatic font color', '自动字体色'],
  hex: ['RGB color {number}', 'RGB 颜色 {number}'],
  invalid: ['Use a color in #RRGGBB format.', '请输入 #RRGGBB 格式的颜色。'],
  browse: ['Choose a color from this column', '从本列选取颜色'],
  hide: ['Hide column colors', '收起本列颜色'],
  loading: ['Loading column colors…', '正在读取本列颜色…'],
  readError: ['Unable to load column colors. Try again or enter an RGB color.', '无法读取本列颜色。请重试或输入 RGB 颜色。'],
  retry: ['Retry colors', '重试读取颜色'],
  empty: ['No selectable colors in this column.', '本列没有可选颜色。'],
  previous: ['Previous color page', '上一页颜色'],
  next: ['Next color page', '下一页颜色'],
  matchingOne: ['{color} (1 row)', '{color}（1 行）'],
  matching: ['{color} ({count} rows)', '{color}（{count} 行）'],
  page: ['{first}–{last} of {total} colors', '第 {first}–{last} 项，共 {total} 种颜色'],
} as const

type Label = keyof typeof pairs

export const colorLabels = Object.fromEntries(
  Object.entries(pairs).map(([key, [message]]) => [key, { id: `dataFilter.color.${key}`, message }]),
) as Record<Label, MessageDescriptor>

function catalog(locale: 0 | 1): Messages {
  return Object.fromEntries(Object.entries(pairs).map(([key, messages]) => [
    colorLabels[key as Label].id!,
    messages[locale].split(/(\{\w+\})/).filter(Boolean).map(part =>
      part.startsWith('{') ? [part.slice(1, -1)] : part),
  ])) as Messages
}

export const colorMessages = { en: catalog(0), zh: catalog(1) }
