import type { Messages } from '@lingui/core'

export const labels = {
  picker: { id: 'plugin.datePicker.title', message: 'Date picker' },
  date: { id: 'plugin.datePicker.date', message: 'Choose date' },
  apply: { id: 'plugin.datePicker.apply', message: 'Use date' },
  cancel: { id: 'plugin.datePicker.cancel', message: 'Cancel date edit' },
  shortcut: { id: 'plugin.datePicker.shortcut', message: 'Press Alt+Down in the editor to choose a date' },
}
export const messages: Partial<Record<'en' | 'zh', Messages>> = {
  en: Object.fromEntries(Object.values(labels).map(({ id, message }) => [id, message])),
  zh: {
    [labels.picker.id]: '日期选择器',
    [labels.date.id]: '选择日期',
    [labels.apply.id]: '使用日期',
    [labels.cancel.id]: '取消日期编辑',
    [labels.shortcut.id]: '在编辑器中按 Alt+↓ 选择日期',
  },
}
