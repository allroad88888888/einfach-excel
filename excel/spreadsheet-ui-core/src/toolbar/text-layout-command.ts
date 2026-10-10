import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { applySelectionFormatAtom, type TextLayoutAction } from './selection-format-command'

/** 只保存操作反馈；对齐/旋转值始终读取当前 Rust 投影。 */
export const textLayoutFeedbackAtom = atom<{ busy: boolean; error: string | null }>({
  busy: false, error: null,
})

/** 三个直接选择入口共用格式写入，只在这里控制等待态和失败提示。 */
export const runTextLayoutAtom = atom(null, async (get, set, action: TextLayoutAction | 'dismiss') => {
  if (get(textLayoutFeedbackAtom).busy) return false
  if (action === 'dismiss') {
    set(textLayoutFeedbackAtom, { busy: false, error: null })
    return true
  }
  const connection = get(rustWorkbookConnectionAtom)
  if (!connection || get(editingSessionAtom).source) return false
  const pending = { busy: true, error: null }
  set(textLayoutFeedbackAtom, pending)
  const response = set(applySelectionFormatAtom, action)
  // 在异步续体发布等待态，不等 Worker 完成才通知控件禁用。
  await Promise.resolve()
  if (get(textLayoutFeedbackAtom) === pending) set(textLayoutFeedbackAtom, pending)
  const outcome = await response
  if (get(textLayoutFeedbackAtom) !== pending) return false
  if (get(rustWorkbookConnectionAtom) !== connection) {
    set(textLayoutFeedbackAtom, { busy: false, error: null })
    return false
  }
  const completed = outcome === 'completed' || outcome === 'superseded'
  set(textLayoutFeedbackAtom, {
    busy: false,
    error: completed ? null : outcome === 'blocked'
      ? 'Select an editable range and wait for the worksheet to finish loading.'
      : 'Could not confirm the layout change. Check the cell before retrying.',
  })
  return completed
})
