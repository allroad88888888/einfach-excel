import { useAtomValue, useSetAtom } from '@einfach/react'
import { activeWorkbookSheetAtom, drawingErrorAtom, projectedFreezeAtom, projectionSnapshotAtom,
  refreshSheetDrawingsAtom, selectDrawingAtom, selectedDrawingAtom, sheetDrawingsAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { useLingui } from '@lingui/react/macro'
import { useEffect, useMemo } from 'react'
import { translateFeedback } from '../../i18n/translate-feedback'
import { useSpreadsheetPlugins } from '../../plugin/plugin-context'
import type { DrawingContribution } from '../../plugin/types'
import { useGridGutter } from '../grid/viewport/grid-gutter'
import { FrozenDrawings } from './FrozenDrawings'
import { ScrollingDrawings } from './ScrollingDrawings'
import './drawings.css'

/** 浮动对象层：读目录、点空白取消选中，按锚点分到滚动区或冻结区渲染。 */
export function DrawingLayer({ focusGrid }: { readonly focusGrid: () => void }) {
  const { gutter, heading } = useGridGutter()
  const { i18n } = useLingui()
  const error = useAtomValue(drawingErrorAtom)
  const drawings = useAtomValue(sheetDrawingsAtom)
  const selectedId = useAtomValue(selectedDrawingAtom)?.id
  const projectedFreeze = useAtomValue(projectedFreezeAtom)
  const sheet = useAtomValue(activeWorkbookSheetAtom)
  const result = useAtomValue(projectionSnapshotAtom).result
  const revision = result?.kind === 'visible-window' ? result.revision : undefined
  const refresh = useSetAtom(refreshSheetDrawingsAtom)
  const select = useSetAtom(selectDrawingAtom)
  const plugins = useSpreadsheetPlugins()
  const renderers = useMemo(() => {
    const byKind = new Map<string, DrawingContribution>()
    for (const plugin of plugins)
      for (const contribution of plugin.drawings ?? []) {
        if (byKind.has(contribution.kind))
          throw new Error(`Duplicate drawing kind: ${contribution.kind}`)
        byKind.set(contribution.kind, contribution)
      }
    return byKind
  }, [plugins])

  // 编辑、撤销、结构变化都会推进投影修订；同一修订的重复调用在 Core 内去重。
  // 没有插件渲染对象时不读目录：不挂插件的工作簿每次编辑仍只有一次 RPC，对象原样留在 Rust 与文件里。
  const enabled = renderers.size > 0
  useEffect(() => { if (enabled) void refresh() }, [enabled, refresh, sheet?.id, revision])

  // 点到对象之外即取消对象选中，网格自己的指针处理照常进行。
  useEffect(() => {
    if (!selectedId) return
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.drawing-frame'))
        select(null)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [selectedId, select])

  const freeze = projectedFreeze?.sheetId === sheet?.id &&
    (projectedFreeze?.rows || projectedFreeze?.cols) ? projectedFreeze : null
  const [frozen, scrolling] = useMemo(() => {
    const isFrozen = (drawing: (typeof drawings)[number]) => Boolean(freeze &&
      (drawing.anchor.row < freeze.rows || drawing.anchor.col < freeze.cols))
    return [drawings.filter(isFrozen), drawings.filter((drawing) => !isFrozen(drawing))]
  }, [drawings, freeze])

  if (!enabled || !drawings.length) return null
  const shared = { renderers, gutter, heading, focusGrid }
  return <>
    <ScrollingDrawings drawings={scrolling} {...shared} />
    {freeze && <FrozenDrawings drawings={frozen} freeze={freeze} {...shared} />}
    {error && <div className="drawing-error-anchor">
      <div className="drawing-error" role="alert" style={{ left: gutter + 8, top: heading + 8 }}>
        {translateFeedback(i18n, error)}</div>
    </div>}
  </>
}
