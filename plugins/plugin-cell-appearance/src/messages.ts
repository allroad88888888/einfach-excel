import type { Messages } from '@lingui/core'

export const labels = {
  diagonalDown: { id: 'plugin.cellAppearance.diagonalDown', message: 'Diagonal down' },
  diagonalUp: { id: 'plugin.cellAppearance.diagonalUp', message: 'Diagonal up' },
  diagonalBoth: { id: 'plugin.cellAppearance.diagonalBoth', message: 'Both diagonals' },
  diagonalNone: { id: 'plugin.cellAppearance.diagonalNone', message: 'No diagonal borders' },
}

export const messages: Partial<Record<'en' | 'zh', Messages>> = {
  en: Object.fromEntries(Object.values(labels).map(({ id, message }) => [id, message])),
  zh: {
    [labels.diagonalDown.id]: '下斜线',
    [labels.diagonalUp.id]: '上斜线',
    [labels.diagonalBoth.id]: '双斜线',
    [labels.diagonalNone.id]: '清除斜线',
  },
}
