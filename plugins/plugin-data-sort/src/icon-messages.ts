import type { Messages } from '@lingui/core'

const descriptions = {
  title: ['Icon sort', '图标排序'],
  hint: ['Move rows by their displayed icons. Levels apply from top to bottom.',
    '按显示图标移动整条记录，排序级别从上到下依次应用。'],
  criterion: ['Cell icon', '单元格图标'],
  target: ['Target icon', '目标图标'],
  none: ['No icon', '无图标'],
  arrows: ['Three arrows', '三箭头'],
  lights: ['Three traffic lights', '三色信号灯'],
  flags: ['Three flags', '三色旗标'],
  arrowDown: ['Down arrow', '向下箭头'],
  arrowRight: ['Right arrow', '向右箭头'],
  arrowUp: ['Up arrow', '向上箭头'],
  redLight: ['Red light', '红灯'],
  yellowLight: ['Yellow light', '黄灯'],
  greenLight: ['Green light', '绿灯'],
  redFlag: ['Red flag', '红旗'],
  yellowFlag: ['Yellow flag', '黄旗'],
  greenFlag: ['Green flag', '绿旗'],
  stale: ['The selection changed. Close and reopen Icon sort.', '选区已改变。请关闭后重新打开图标排序。'],
  chooseIcon: ['Choose an icon or color criterion for at least one level.', '请至少为一个排序级别选择图标或颜色。'],
} as const

type Key = keyof typeof descriptions
export const iconLabels = Object.fromEntries(Object.entries(descriptions).map(
  ([key, [message]]) => [key, { id: `plugin.dataSort.icon.${key}`, message }],
)) as Record<Key, { id: string; message: string }>

export const iconMessages = (locale: 'en' | 'zh'): Messages => Object.fromEntries(
  (Object.keys(descriptions) as Key[]).map(key => [
    iconLabels[key].id, descriptions[key][locale === 'en' ? 0 : 1],
  ]),
)
