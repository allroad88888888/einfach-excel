import { atom } from '@einfach/core'

/** 「更多图表」菜单是否展开；纯界面瞬态，不进工作簿。 */
export const moreChartsMenuOpenAtom = atom(false)
moreChartsMenuOpenAtom.debugLabel = 'plugin.chart.moreMenu.open'
