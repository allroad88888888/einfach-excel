import { atom } from '@einfach/core'

/** 按工作表 id 记的缩放百分比；新工作簿初始化时清空。 */
export const zoomBySheetAtom = atom<Readonly<Record<string, number>>>({})
zoomBySheetAtom.debugLabel = 'spreadsheet.zoom.bySheet'
