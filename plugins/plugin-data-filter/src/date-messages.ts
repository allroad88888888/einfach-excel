import type { Messages } from '@lingui/core'
import type { FilterDatePeriod } from '@einfach-excel/spreadsheet-ui-core'

export const dateLabels = {
  title: { id: 'plugin.dataFilter.date.title', message: 'Date period' },
  activate: { id: 'plugin.dataFilter.date.activate', message: 'Date period…' },
  period: { id: 'plugin.dataFilter.date.period', message: 'Date period {number}' },
  hint: { id: 'plugin.dataFilter.date.hint', message: 'Uses local calendar dates when applied. Weeks run Sunday–Saturday. Includes times; text dates do not match. Use Reapply to update.' },
}
const names: Record<FilterDatePeriod, readonly [string, string]> = {
  today: ['Today', '今天'], yesterday: ['Yesterday', '昨天'], tomorrow: ['Tomorrow', '明天'],
  'last-week': ['Last week', '上周'], 'this-week': ['This week', '本周'], 'next-week': ['Next week', '下周'],
  'last-month': ['Last month', '上月'], 'this-month': ['This month', '本月'], 'next-month': ['Next month', '下月'],
  'last-quarter': ['Last quarter', '上季度'], 'this-quarter': ['This quarter', '本季度'],
  'next-quarter': ['Next quarter', '下季度'], 'last-year': ['Last year', '去年'],
  'this-year': ['This year', '今年'], 'next-year': ['Next year', '明年'],
  'year-to-date': ['Year to date', '年初至今'],
}
export const periodLabel = (period: FilterDatePeriod) => ({
  id: `plugin.dataFilter.date.${period}`, message: names[period][0],
})
export const dateMessages: Partial<Record<'en' | 'zh', Messages>> = {
  en: {
    ...Object.fromEntries(Object.values(dateLabels).map(({ id, message }) => [id, [message]])),
    ...Object.fromEntries(Object.entries(names).map(([period, translated]) =>
      [`plugin.dataFilter.date.${period}`, [translated[0]]])),
    [dateLabels.period.id]: ['Date period ', ['number']],
  },
  zh: {
    ...Object.fromEntries(Object.entries(names).map(([period, translated]) =>
      [`plugin.dataFilter.date.${period}`, [translated[1]]])),
    [dateLabels.title.id]: ['日期期间'], [dateLabels.activate.id]: ['日期期间…'],
    [dateLabels.period.id]: ['日期期间 ', ['number']],
    [dateLabels.hint.id]: ['应用时按本地日历日期筛选，周日到周六为一周。包含时间，文本日期不匹配。使用重新应用更新结果。'],
  },
}
