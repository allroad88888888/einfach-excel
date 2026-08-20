import { atom } from '@einfach/core'

/** 大数据 seed 分块导入的进度事实(引擎侧已归一化格数,非发送侧计数)。 */
export interface WorkbookImportProgress {
  readonly importedCells: number
  readonly totalCells: number
  readonly done: boolean
}

/**
 * 每个 demo 岛一个进度 atom(岛用默认 store,与 SpreadsheetUiProvider 的
 * 私有 store 无关 —— 与 performance-hud 的 metrics atom 同一模式)。
 */
export function createImportProgressAtom(totalCells: number) {
  const progressAtom = atom<WorkbookImportProgress>({
    importedCells: 0,
    totalCells,
    done: false,
  })
  progressAtom.debugLabel = 'site.demo.importProgress'
  return progressAtom
}

export type ImportProgressAtom = ReturnType<typeof createImportProgressAtom>
