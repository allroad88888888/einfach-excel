import { Show } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import type { ImportProgressAtom } from './import-progress-state'

interface ImportProgressProps {
  progressAtom: ImportProgressAtom
  locale: 'en' | 'zh'
}

/**
 * 大数据 seed 导入期间的可见进度条。导入完成即整体卸载 —— 它只负责回答
 * "还在导,导到哪了",不承担错误态(失败走 workbook recovery surface)。
 */
export default function ImportProgress(props: ImportProgressProps) {
  const progress = useAtomValue(props.progressAtom)
  const percent = () => {
    const { importedCells, totalCells } = progress()
    return totalCells > 0 ? Math.floor((importedCells / totalCells) * 100) : 0
  }

  return (
    <Show when={!progress().done}>
      <div
        class="import-progress"
        role="status"
        aria-live="polite"
        data-testid="demo-import-progress"
      >
        <span class="import-progress-label">
          {props.locale === 'zh' ? '正在导入工作簿数据…' : 'Importing workbook data…'}
        </span>
        <progress max={progress().totalCells} value={progress().importedCells} />
        <span class="import-progress-count">
          {progress().importedCells.toLocaleString()} / {progress().totalCells.toLocaleString()} (
          {percent()}%)
        </span>
      </div>
    </Show>
  )
}
