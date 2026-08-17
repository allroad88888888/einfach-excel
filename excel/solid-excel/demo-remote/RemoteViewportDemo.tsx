// 一句话：AD-828 远程视口浏览演示页 —— vNext 网格对着 HTTP 对端浏览 10 万行工作簿。
//
// 从 `<App>` 经 `?backend=remote` 进入。后端是同目录 `http-backend.ts` 的三方法
// fetch 适配器，数据在 `server.mjs`（默认 http://127.0.0.1:5303）的进程内存里；
// 载荷跟视口窗口走，不随工作簿大小。`?remote=<origin>` 可覆盖服务端地址。

import { onMount, Show } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import {
  selectCellAtom,
  selectionAtom,
  setWorkspaceActiveSheetAtom,
  workspaceSessionAtom,
  type ViewportMetrics,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetFormulaBar } from '../src-vnext/formula-bar'
import { SpreadsheetGrid } from '../src-vnext/grid'
import { SpreadsheetStatusBar } from '../src-vnext/status-bar'
import { SpreadsheetUiProvider, useSpreadsheetUiStore } from '../src-vnext/provider'
import { createHttpSpreadsheetBackend } from './http-backend'

const REMOTE_DEFAULT_PORT = 5303

const sheets = [{ id: 'remote-sheet', name: 'Remote 100k' }]

/** 与服务端工作簿同口径：100,000 行 × 6 列。 */
const viewport: ViewportMetrics = {
  scrollTop: 0,
  scrollLeft: 0,
  viewportHeight: 480,
  viewportWidth: 720,
  rowHeight: 24,
  colWidth: 120,
  rowCount: 100_000,
  colCount: 6,
  overscanRows: 0,
  overscanCols: 0,
}

function resolveRemoteBaseUrl(): string {
  if (typeof window === 'undefined') return `http://127.0.0.1:${REMOTE_DEFAULT_PORT}`
  const override = new URLSearchParams(window.location.search).get('remote')
  if (override) return override.replace(/\/+$/, '')
  return `${window.location.protocol}//${window.location.hostname}:${REMOTE_DEFAULT_PORT}`
}

function RemoteViewportWorkbook() {
  const store = useSpreadsheetUiStore()
  const workspace = useAtomValue(workspaceSessionAtom)
  const activeSheetId = () => workspace().activeSheetId ?? sheets[0].id

  onMount(() => {
    const sid = store.getter(workspaceSessionAtom).activeSheetId ?? sheets[0].id
    if (!store.getter(workspaceSessionAtom).activeSheetId) {
      store.setter(setWorkspaceActiveSheetAtom, { sheetId: sheets[0].id })
    }
    if (!store.getter(selectionAtom).sheetId) {
      store.setter(selectCellAtom, { sheetId: sid, coord: { row: 0, col: 0 } })
    }
  })

  return (
    <>
      <SpreadsheetFormulaBar data-testid="remote-formula-bar" />
      <Show keyed when={activeSheetId()}>
        {(sheetId) => (
          <SpreadsheetGrid sheetId={sheetId} viewport={viewport} data-testid="remote-grid" />
        )}
      </Show>
      <SpreadsheetStatusBar data-testid="remote-status-bar" />
    </>
  )
}

export function RemoteViewportDemo() {
  const baseUrl = resolveRemoteBaseUrl()
  const backend = createHttpSpreadsheetBackend({ baseUrl })

  return (
    <div class="demo-page vnext-demo">
      <div class="demo-header">
        <h3>Remote Viewport Browse (AD-828)</h3>
        <p class="demo-desc" data-testid="remote-backend-banner">
          vNext UI browsing a 100,000-row workbook over HTTP at <code>{baseUrl}</code> — the
          backend port speaks fetch instead of a Web Worker; only the three required methods
          are implemented, everything optional degrades away. Start the peer with{' '}
          <code>node excel/solid-excel/demo-remote/server.mjs</code>.
        </p>
      </div>

      <SpreadsheetUiProvider backend={backend}>
        <RemoteViewportWorkbook />
      </SpreadsheetUiProvider>
    </div>
  )
}
