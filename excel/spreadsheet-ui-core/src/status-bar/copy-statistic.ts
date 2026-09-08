import { atom } from '@einfach/core'
import { selectionStatisticLabels, type SelectionStatistic } from './preferences'

const feedbackAtom = atom({ busy: false, error: false, message: '' })
export const selectionStatisticCopyFeedbackAtom = atom((get) => get(feedbackAtom))

/** 复制点击时的原生统计结果，不解析展示文本，不生成单元格剪贴板快照。 */
export const copySelectionStatisticAtom = atom(null, async (get, set, input: {
  readonly statistic: SelectionStatistic
  readonly value: number | null
  readonly write: (text: Promise<string>) => Promise<void>
}): Promise<boolean> => {
  if (get(feedbackAtom).busy) return false
  if (input.value === null || !Number.isFinite(input.value)) {
    set(feedbackAtom, { busy: false, error: true, message: 'This statistic has no finite value to copy.' })
    return false
  }
  // 参数是点击按钮那一刻的原始 number；后续选区、异步 atom 或显示精度变化不影响它。
  const text = Promise.resolve(String(input.value))
  set(feedbackAtom, { busy: true, error: false, message: 'Copying statistic…' })
  try {
    // 用户手势内同步启动 ClipboardItem；异步结果只用于填充纯文本。
    const written = new Promise<void>((resolve) => resolve(input.write(text)))
    await Promise.all([text, written])
    set(feedbackAtom, {
      busy: false, error: false, message: `Copied ${selectionStatisticLabels[input.statistic]}.`,
    })
    return true
  } catch (error) {
    set(feedbackAtom, {
      busy: false, error: true, message: error instanceof Error ? error.message : String(error),
    })
    return false
  }
})
