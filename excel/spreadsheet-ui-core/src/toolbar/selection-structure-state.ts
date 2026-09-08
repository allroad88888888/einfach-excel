import { atom } from '@einfach/core'

/** 菜单反馈也供历史、工作表命令防止在插删未确认时改动画布身份。 */
export const selectionStructureFeedbackAtom = atom({ busy: false, error: null as string | null })
selectionStructureFeedbackAtom.debugLabel = 'spreadsheet.structure.feedback'
