import type { Messages } from '@lingui/core'

export const labels = {
  superscript: { id: 'plugin.textFormat.superscript', message: 'Superscript' },
  subscript: { id: 'plugin.textFormat.subscript', message: 'Subscript' },
  shrinkToFit: { id: 'plugin.textFormat.shrinkToFit', message: 'Shrink to fit' },
  shrinkApplying: { id: 'plugin.textFormat.shrinkApplying', message: 'Applying text layout…' },
  shrinkNotApplicable: { id: 'plugin.textFormat.shrinkNotApplicable',
    message: 'Line breaks and vertical text keep their original size.' },
  shrinkUnconfirmed: { id: 'plugin.textFormat.shrinkUnconfirmed',
    message: 'Could not confirm the text layout change. Check the cell before retrying.' },
  applying: { id: 'plugin.textFormat.applying', message: 'Applying font baseline…' },
  dismiss: { id: 'plugin.textFormat.dismiss', message: 'Dismiss font error' },
  blocked: { id: 'plugin.textFormat.blocked',
    message: 'Select an editable range and wait for the worksheet to finish loading.' },
  unconfirmed: { id: 'plugin.textFormat.unconfirmed',
    message: 'Could not confirm the font change. Check the cell before retrying.' },
}

export const messages: Partial<Record<'en' | 'zh', Messages>> = {
  en: Object.fromEntries(Object.values(labels).map(({ id, message }) => [id, message])),
  zh: {
    [labels.superscript.id]: '上标',
    [labels.subscript.id]: '下标',
    [labels.shrinkToFit.id]: '缩小字体填充',
    [labels.shrinkApplying.id]: '正在应用文字布局…',
    [labels.shrinkNotApplicable.id]: '包含换行或竖排的文字保持原显示字号。',
    [labels.shrinkUnconfirmed.id]: '无法确认文字布局更改。请检查单元格后重试。',
    [labels.applying.id]: '正在应用上下标…',
    [labels.dismiss.id]: '关闭字体错误提示',
    [labels.blocked.id]: '请选择可编辑区域，并等待工作表加载完成。',
    [labels.unconfirmed.id]: '无法确认字体更改。请检查单元格后重试。',
  },
}
