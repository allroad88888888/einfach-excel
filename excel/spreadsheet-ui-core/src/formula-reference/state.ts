import { atom } from '@einfach/core'
import type { FormulaReferenceSession } from './types'

// 独立的状态叶节点：编辑开始/结束可清理引用，不反向依赖引用命令造成循环。
export const formulaReferenceSessionBackingAtom = atom<FormulaReferenceSession | null>(null)
export const formulaReferenceCaretBackingAtom = atom(-1)
export const resetFormulaReferenceStateAtom = atom(null, (_get, set) => {
  set(formulaReferenceSessionBackingAtom, null)
  set(formulaReferenceCaretBackingAtom, -1)
})
