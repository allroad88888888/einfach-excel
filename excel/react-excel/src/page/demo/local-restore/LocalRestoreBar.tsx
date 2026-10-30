import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  exportWorkbookSnapshotAtom,
  workbookChangeAtom,
  workbookReplacementErrorAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { lastSnapshotSavedAt, markSnapshotSaved, subscribeSavedSnapshot } from './saved-snapshot'
import { clearSavedSnapshot, writeSavedSnapshot } from './snapshot-store'

const SAVE_DELAY_MS = 400
const SAVED_SOURCES = new Set(['user', 'api', 'history', 'import'])

/** 演示宿主的保存循环：每次用户修改后导出原生快照写进 IndexedDB，刷新时由页面传回组件。 */
export function LocalRestoreBar() {
  const { t } = useLingui()
  const change = useAtomValue(workbookChangeAtom)
  const restoreError = useAtomValue(workbookReplacementErrorAtom)
  const exportSnapshot = useSetAtom(exportWorkbookSnapshotAtom)
  const savedAt = useSyncExternalStore(subscribeSavedSnapshot, lastSnapshotSavedAt)
  // 非渲染身份：挂载时那条连接的 import 是启动本身，不是修改；之后换簿（打开文件）才要保存。
  const startupConnection = useRef<string | null>(null)

  useEffect(() => {
    if (!change || !SAVED_SOURCES.has(change.source)) return
    startupConnection.current ??= change.connectionId
    if (change.source === 'import' && change.connectionId === startupConnection.current) return
    const timer = window.setTimeout(() => {
      void exportSnapshot().then(async (result) => {
        if (result.status !== 'ok') return
        await writeSavedSnapshot(result.snapshot)
        markSnapshotSaved()
      })
    }, SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [change, exportSnapshot])

  return (
    <div className="local-restore-bar" role="region" aria-label={t`Local restore`}>
      <span role="status" aria-label={t`Local save status`}>
        {savedAt === null
          ? <Trans>Edits are saved in this browser and restored after a refresh.</Trans>
          : <Trans>Saved in this browser at {new Date(savedAt).toLocaleTimeString()}.</Trans>}
      </span>
      {restoreError && <span role="alert"><Trans>
        The saved copy could not be opened and the sample was loaded instead: {restoreError.message}
      </Trans></span>}
      <button type="button" onClick={() => {
        void clearSavedSnapshot().then(() => window.location.reload())
      }}>
        <Trans>Discard saved copy</Trans>
      </button>
    </div>
  )
}
