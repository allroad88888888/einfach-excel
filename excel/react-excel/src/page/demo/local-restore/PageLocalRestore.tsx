import { useSyncExternalStore } from 'react'
import { WorkbookRuntimeProvider } from '../../WorkbookRuntimeProvider'
import { WorkbookView } from '../../../workbook/shell/WorkbookView'
import { SALES_ORDERS_WORKBOOK_DEFINITION } from '../sales-orders/sales-orders-workbook'
import { demoPresentation } from '../demo-presentation'
import { initialSnapshotState, subscribeSavedSnapshot } from './saved-snapshot'
import { LocalRestoreBar } from './LocalRestoreBar'
import './local-restore.css'

/** 宿主持久化示例：首次挂载前读出上次的快照，交给组件从快照启动。 */
export function PageLocalRestore() {
  const saved = useSyncExternalStore(subscribeSavedSnapshot, initialSnapshotState)
  if (saved.status === 'loading')
    // 还在 I18nProvider 外面；与演示站外壳一样直接写中文。
    return <div role="status">正在读取本浏览器保存的副本…</div>
  return (
    <div className="local-restore-page">
      <WorkbookRuntimeProvider definition={SALES_ORDERS_WORKBOOK_DEFINITION}
        {...(saved.status === 'ready' && saved.snapshot ? { initialSnapshot: saved.snapshot } : {})}
        {...demoPresentation()}>
        <LocalRestoreBar />
        <WorkbookView />
      </WorkbookRuntimeProvider>
    </div>
  )
}
