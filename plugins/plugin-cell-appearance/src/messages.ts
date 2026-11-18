import type { Messages } from '@lingui/core'
import type { SpreadsheetFillPattern } from '@einfach-excel/spreadsheet-ui-core'

export const labels = {
  diagonalDown: { id: 'plugin.cellAppearance.diagonalDown', message: 'Diagonal down' },
  diagonalUp: { id: 'plugin.cellAppearance.diagonalUp', message: 'Diagonal up' },
  diagonalBoth: { id: 'plugin.cellAppearance.diagonalBoth', message: 'Both diagonals' },
  diagonalNone: { id: 'plugin.cellAppearance.diagonalNone', message: 'No diagonal borders' },
  patternTitle: { id: 'plugin.cellAppearance.patternTitle', message: 'Pattern fill' },
  pattern: { id: 'plugin.cellAppearance.pattern', message: 'Pattern' },
  foreground: { id: 'plugin.cellAppearance.foreground', message: 'Pattern color' },
  background: { id: 'plugin.cellAppearance.background', message: 'Background color' },
  colorHint: { id: 'plugin.cellAppearance.colorHint', message: 'Enter colors as #RRGGBB.' },
  preview: { id: 'plugin.cellAppearance.preview', message: 'Fill preview' },
  apply: { id: 'plugin.cellAppearance.apply', message: 'Apply fill' },
  cancel: { id: 'plugin.cellAppearance.cancel', message: 'Cancel' },
  applying: { id: 'plugin.cellAppearance.applying', message: 'Applying fill…' },
  invalid: { id: 'plugin.cellAppearance.invalid', message: 'Enter a valid #RRGGBB color in both fields.' },
  selection: { id: 'plugin.cellAppearance.selection', message: 'The selection changed. Close this dialog and reopen it for the new selection.' },
  failed: { id: 'plugin.cellAppearance.failed', message: 'The fill could not be confirmed. Your draft is kept; check the selection before trying again.' },
}

const patterns: Record<SpreadsheetFillPattern, readonly [string, string]> = {
  mediumGray: ['50% gray', '50% 灰度'],
  darkGray: ['75% gray', '75% 灰度'],
  lightGray: ['25% gray', '25% 灰度'],
  darkHorizontal: ['Thick horizontal stripes', '粗水平条纹'],
  darkVertical: ['Thick vertical stripes', '粗垂直条纹'],
  darkDown: ['Thick downward diagonal stripes', '粗下斜条纹'],
  darkUp: ['Thick upward diagonal stripes', '粗上斜条纹'],
  darkGrid: ['Dense grid', '密集网格'],
  darkTrellis: ['Dense diagonal grid', '密集斜网格'],
  lightHorizontal: ['Thin horizontal stripes', '细水平条纹'],
  lightVertical: ['Thin vertical stripes', '细垂直条纹'],
  lightDown: ['Thin downward diagonal stripes', '细下斜条纹'],
  lightUp: ['Thin upward diagonal stripes', '细上斜条纹'],
  lightGrid: ['Sparse grid', '稀疏网格'],
  lightTrellis: ['Sparse diagonal grid', '稀疏斜网格'],
  gray125: ['12.5% dots', '12.5% 点状'],
  gray0625: ['6.25% dots', '6.25% 点状'],
}
export const patternLabels = Object.fromEntries(Object.entries(patterns).map(([key, [message]]) =>
  [key, { id: `plugin.cellAppearance.pattern.${key}`, message }])) as
    Record<SpreadsheetFillPattern, { id: string; message: string }>

export const messages: Partial<Record<'en' | 'zh', Messages>> = {
  en: Object.fromEntries([...Object.values(labels), ...Object.values(patternLabels)]
    .map(({ id, message }) => [id, message])),
  zh: {
    [labels.diagonalDown.id]: '下斜线',
    [labels.diagonalUp.id]: '上斜线',
    [labels.diagonalBoth.id]: '双斜线',
    [labels.diagonalNone.id]: '清除斜线',
    [labels.patternTitle.id]: '图案填充',
    [labels.pattern.id]: '图案',
    [labels.foreground.id]: '图案颜色',
    [labels.background.id]: '底色',
    [labels.colorHint.id]: '请输入 #RRGGBB 格式的颜色。',
    [labels.preview.id]: '填充预览',
    [labels.apply.id]: '应用填充',
    [labels.cancel.id]: '取消',
    [labels.applying.id]: '正在应用填充…',
    [labels.invalid.id]: '请在两个输入框中填写有效的 #RRGGBB 颜色。',
    [labels.selection.id]: '选区已改变。请关闭对话框，再为新选区打开。',
    [labels.failed.id]: '未能确认填充结果。草稿已保留，请检查选区后重试。',
    ...Object.fromEntries(Object.entries(patterns).map(([key, [, zh]]) =>
      [`plugin.cellAppearance.pattern.${key}`, zh])),
  },
}
