import type { Messages } from '@lingui/core'

const descriptions = {
  title: ['Color sort', '颜色排序'],
  hint: ['Move rows by their displayed colors. Levels apply from top to bottom.',
    '按显示颜色移动整条记录，排序级别从上到下依次应用。'],
  kind: ['Sort on', '排序依据'],
  fill: ['Cell fill color', '单元格填充色'],
  font: ['Font color', '字体颜色'],
  target: ['Target color', '目标颜色'],
  noFill: ['No fill', '无填充'],
  automatic: ['Automatic font color', '自动字体颜色'],
  top: ['On top', '置顶'],
  bottom: ['On bottom', '置底'],
  stale: ['The selection changed. Close and reopen Color sort.', '选区已改变。请关闭后重新打开颜色排序。'],
  chooseColor: ['Choose a color criterion for at least one level.', '请至少为一个排序级别选择颜色依据。'],
} as const

type Key = keyof typeof descriptions
export const colorLabels = Object.fromEntries(Object.entries(descriptions).map(
  ([key, [message]]) => [key, { id: `plugin.dataSort.color.${key}`, message }],
)) as Record<Key, { id: string; message: string }>

export const colorMessages = (locale: 'en' | 'zh'): Messages => Object.fromEntries(
  (Object.keys(descriptions) as Key[]).map(key => [
    colorLabels[key].id, descriptions[key][locale === 'en' ? 0 : 1],
  ]),
)
