// 一句话：基准夹具 —— 把 worker/WASM 后端 + vnext 网格挂进容器，按档位灌数并等首批单元格上屏。

import { render } from 'solid-js/web'
import type { ViewportMetrics } from '@einfach/spreadsheet-ui-core'
import {
  createWorkerWorkbookSpreadsheetBackend,
  refreshVisibleProjection,
  SpreadsheetGrid,
  SpreadsheetUiProvider,
  useSpreadsheetUiStore,
  type WorkerWorkbookSpreadsheetBackend,
} from '../../src-vnext'
import { defaultVNextWorkbookWorkerFactory } from '../../src-vnext/adapter/worker-factory'
import { waitForCellText } from './frame'
import { BENCH_TIERS, tierImportChunks, type BenchDataShape } from './tier-data'
import type { BenchTierId } from './types'

export const BENCH_SHEET_ID = 'bench-sheet'

const FIRST_PAINT_TIMEOUT_MS = 120_000

export interface BenchFixtureOptions {
  /** 夹具挂载的容器；由场景的 stage 提供。 */
  container: HTMLElement
  tier: BenchTierId
  shape: BenchDataShape
  /** 视口尺寸覆写；行列总数始终由档位决定。 */
  viewport?: Partial<Pick<ViewportMetrics, 'viewportHeight' | 'viewportWidth'>>
  /** 首批单元格判定：默认等 A1 呈现档位数据的首个值。 */
  firstCell?: { addr: string; text: string }
}

export interface BenchFixture {
  backend: WorkerWorkbookSpreadsheetBackend
  viewport: ViewportMetrics
  /** 网格的滚动容器（.spreadsheet-grid-scroll-viewport）。 */
  scrollViewport: HTMLElement
  root: HTMLElement
  /** 首批单元格上屏那一帧的 rAF 时间戳（performance.now() 时基）。 */
  firstCellRenderedAt: number
  /**
   * 按编辑提交同款路径重读当前可见窗口投影。WASM runtime 不对普通写入广播
   * cellsDirty（vnext 编辑控制器在写 ACK 后自己刷新），backend 直写后必须
   * 调用它，DOM 才会呈现新值。
   */
  refreshProjection(): Promise<void>
  dispose(): void
}

type UiStore = ReturnType<typeof useSpreadsheetUiStore>

function StoreProbe(props: { onStore: (store: UiStore) => void }) {
  props.onStore(useSpreadsheetUiStore())
  return null
}

function buildViewport(tier: BenchTierId, shape: BenchDataShape, options: BenchFixtureOptions) {
  const definition = BENCH_TIERS[tier]
  const viewport: ViewportMetrics = {
    scrollTop: 0,
    scrollLeft: 0,
    viewportHeight: options.viewport?.viewportHeight ?? 480,
    viewportWidth: options.viewport?.viewportWidth ?? 960,
    rowHeight: 24,
    colWidth: 96,
    rowCount: shape === 'grid' ? definition.gridRows : definition.formulaChainRows,
    colCount: shape === 'grid' ? definition.gridColumns : 2,
    overscanRows: 0,
    overscanCols: 0,
  }
  return viewport
}

/**
 * 挂载夹具并在其首批单元格可见后 resolve。灌数走 worker 的 direct 导入会话
 * （与文件导入同一条批量通道），不计入任何样本 —— 采样窗口由各场景自己定义。
 */
export async function mountBenchFixture(options: BenchFixtureOptions): Promise<BenchFixture> {
  const viewport = buildViewport(options.tier, options.shape, options)
  const backend = createWorkerWorkbookSpreadsheetBackend({
    workerFactory: defaultVNextWorkbookWorkerFactory,
    sheets: [{ id: BENCH_SHEET_ID, name: 'Bench' }],
    afterInit: async (client, sheets) => {
      const sheetIdx = sheets[0].idx
      const sessionId = await client.beginImport({ mode: 'direct' })
      try {
        for (const chunk of tierImportChunks(options.tier, options.shape, sheetIdx)) {
          await client.importChunk(sessionId, chunk)
        }
        const stats = await client.commitImport(sessionId)
        if (stats.errors > 0 || stats.rejectedFormulas > 0) {
          throw new Error(
            `tier seed rejected: errors=${stats.errors} rejectedFormulas=${stats.rejectedFormulas}`,
          )
        }
      } catch (error) {
        await client.cancelImport(sessionId).catch(() => {})
        throw error
      }
    },
  })

  const root = document.createElement('div')
  root.dataset.testid = 'bench-fixture-root'
  options.container.appendChild(root)

  let store: UiStore | undefined
  const disposeSolid = render(
    () => (
      <SpreadsheetUiProvider backend={backend}>
        <StoreProbe onStore={(captured) => (store = captured)} />
        <SpreadsheetGrid
          sheetId={BENCH_SHEET_ID}
          viewport={viewport}
          data-testid="bench-grid"
        />
      </SpreadsheetUiProvider>
    ),
    root,
  )

  function dispose() {
    disposeSolid()
    backend.dispose()
    root.remove()
  }

  try {
    await backend.ready()
    const firstCell =
      options.firstCell ??
      (options.shape === 'grid' ? { addr: 'A1', text: 'r0c0' } : { addr: 'A1', text: '1' })
    const { observedAt } = await waitForCellText(
      root,
      firstCell.addr,
      firstCell.text,
      FIRST_PAINT_TIMEOUT_MS,
    )
    const scrollViewport = root.querySelector<HTMLElement>('.spreadsheet-grid-scroll-viewport')
    if (!scrollViewport) throw new Error('bench fixture: grid scroll viewport not found')
    return {
      backend,
      viewport,
      scrollViewport,
      root,
      firstCellRenderedAt: observedAt,
      refreshProjection: async () => {
        if (!store) throw new Error('bench fixture: ui store was never captured')
        await refreshVisibleProjection(store, backend, BENCH_SHEET_ID)
      },
      dispose,
    }
  } catch (error) {
    dispose()
    throw error
  }
}
