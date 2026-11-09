import { atom } from '@einfach/core'
import { insertSparklineAtom, sparklineDraftAtom } from './edit'
import { formatRange } from './range-text'
import type { SparklineType } from './spec'

interface Dialog {
  readonly open: boolean
  readonly type: SparklineType
  readonly data: string
  readonly location: string
}
const dialogStateAtom = atom<Dialog>({ open: false, type: 'line', data: '', location: '' })
dialogStateAtom.debugLabel = 'plugin.sparkline.dialog.state'
export const sparklineDialogAtom = atom((get) => get(dialogStateAtom))
sparklineDialogAtom.debugLabel = 'plugin.sparkline.dialog'

/** 「创建迷你图」：数据区域预填当前选区（同 Excel），位置由用户填。 */
export const openSparklineDialogAtom = atom(null, (get, set, type: SparklineType) => {
  const draft = get(sparklineDraftAtom)
  set(dialogStateAtom, { open: true, type, data: draft ? formatRange(draft) : '', location: '' })
})
openSparklineDialogAtom.debugLabel = 'plugin.sparkline.dialog.open'

export const editSparklineDialogAtom = atom(null,
  (get, set, patch: Partial<Pick<Dialog, 'data' | 'location' | 'type'>>) =>
    set(dialogStateAtom, { ...get(dialogStateAtom), ...patch }))
editSparklineDialogAtom.debugLabel = 'plugin.sparkline.dialog.edit'

export const closeSparklineDialogAtom = atom(null, (get, set) =>
  set(dialogStateAtom, { ...get(dialogStateAtom), open: false }))
closeSparklineDialogAtom.debugLabel = 'plugin.sparkline.dialog.close'

/** 确定：创建成功才关闭；失败时错误留在对话框里。 */
export const submitSparklineDialogAtom = atom(null, async (get, set) => {
  const { type, data, location } = get(dialogStateAtom)
  if (await set(insertSparklineAtom, { type, data, location }))
    set(dialogStateAtom, { ...get(dialogStateAtom), open: false })
})
submitSparklineDialogAtom.debugLabel = 'plugin.sparkline.dialog.submit'
