import type { Messages } from '@lingui/core'

export const labels = {
  title: { id: 'plugin.dataFilter.top.title', message: 'Top / Bottom' },
  activate: { id: 'plugin.dataFilter.top.activate', message: 'Top / Bottom…' },
  direction: { id: 'plugin.dataFilter.top.direction', message: 'Rank direction {number}' },
  amount: { id: 'plugin.dataFilter.top.amount', message: 'Rank amount {number}' },
  unit: { id: 'plugin.dataFilter.top.unit', message: 'Rank unit {number}' },
  top: { id: 'plugin.dataFilter.top.top', message: 'Top' },
  bottom: { id: 'plugin.dataFilter.top.bottom', message: 'Bottom' },
  items: { id: 'plugin.dataFilter.top.items', message: 'Items' },
  percent: { id: 'plugin.dataFilter.top.percent', message: 'Percent' },
  hint: { id: 'plugin.dataFilter.top.hint', message: 'Ranks numeric cells across all data rows before other conditions. Includes ties. Percent rounds up. Items: 1–500; percent: 1–100.' },
}
export const messages: Partial<Record<'en' | 'zh', Messages>> = {
  en: {
    ...Object.fromEntries(Object.values(labels).map(({ id, message }) => [id, [message]])),
    [labels.direction.id]: ['Rank direction ', ['number']],
    [labels.amount.id]: ['Rank amount ', ['number']],
    [labels.unit.id]: ['Rank unit ', ['number']],
  },
  zh: {
    [labels.title.id]: ['前 / 后若干项'], [labels.activate.id]: ['前 / 后若干项…'],
    [labels.direction.id]: ['排名方向 ', ['number']],
    [labels.amount.id]: ['排名数量 ', ['number']],
    [labels.unit.id]: ['排名单位 ', ['number']],
    [labels.top.id]: ['前'], [labels.bottom.id]: ['后'],
    [labels.items.id]: ['项'], [labels.percent.id]: ['百分比'],
    [labels.hint.id]: ['先对完整数据行中的数值排名，再与其他条件求交集。包含并列项，百分比名额向上取整。项数：1–500；百分比：1–100。'],
  },
}
