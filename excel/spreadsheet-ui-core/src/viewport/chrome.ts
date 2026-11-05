import { atom, type Atom } from '@einfach/core'

// 公式栏显隐是本挂载的界面状态，不写入工作簿；网格线与行列标题属于工作表视图选项，
// 存于 Rust，见 sheet-management/sheet-view.ts。

const viewportShowFormulaBarBackingAtom = atom<boolean>(true)
viewportShowFormulaBarBackingAtom.debugLabel = 'spreadsheet.viewport.showFormulaBarBacking'

export const viewportShowFormulaBarAtom: Atom<boolean> = atom((get) =>
  get(viewportShowFormulaBarBackingAtom),
)
viewportShowFormulaBarAtom.debugLabel = 'spreadsheet.viewport.showFormulaBar'

export const toggleFormulaBarAtom = atom(
  (get) => get(viewportShowFormulaBarBackingAtom),
  (get, set) => {
    set(viewportShowFormulaBarBackingAtom, !get(viewportShowFormulaBarBackingAtom))
  },
)
toggleFormulaBarAtom.debugLabel = 'spreadsheet.viewport.toggleFormulaBar'
