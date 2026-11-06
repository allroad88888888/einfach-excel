import { atom } from '@einfach/core'

interface ExportState {
  readonly busy: boolean
  readonly error: string | null
  readonly done: 'copy' | 'download' | null
}
const IDLE: ExportState = { busy: false, error: null, done: null }
const stateAtom = atom<ExportState>(IDLE)
stateAtom.debugLabel = 'plugin.chart.export.state'

export const chartExportFeedbackAtom = atom((get) => get(stateAtom))
chartExportFeedbackAtom.debugLabel = 'plugin.chart.export.feedback'

/** 浏览器输出（剪贴板 / 下载）由视图注入；这里只管忙碌、成功与错误状态，同一时间只跑一次。 */
export const runChartExportAtom = atom(null, async (get, set, input: {
  readonly kind: 'copy' | 'download'
  readonly write: () => Promise<void>
}): Promise<boolean> => {
  if (get(stateAtom).busy) return false
  set(stateAtom, { busy: true, error: null, done: null })
  try {
    await input.write()
    set(stateAtom, { busy: false, error: null, done: input.kind })
    return true
  } catch (error) {
    set(stateAtom, { busy: false, error: error instanceof Error ? error.message : String(error),
      done: null })
    return false
  }
})
runChartExportAtom.debugLabel = 'plugin.chart.export.run'

export const resetChartExportAtom = atom(null, (_get, set) => set(stateAtom, IDLE))
resetChartExportAtom.debugLabel = 'plugin.chart.export.reset'
