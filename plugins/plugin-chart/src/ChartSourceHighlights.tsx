import { useAtomValue, useSetAtom } from '@einfach/react'
import { workbookHighlightsAtom } from '@einfach-excel/spreadsheet-ui-core'
import { useEffect } from 'react'
import { chartSourceHighlightsAtom, syncChartHighlightsAtom } from './core'

/**
 * 不渲染任何东西：选中图表或点中数据点时，把数据源高亮并进工作簿的宿主高亮层
 * （网格负责画）；宿主改写高亮后补回图表自己那部分，卸载时撤掉。
 */
export function ChartSourceHighlights() {
  const own = useAtomValue(chartSourceHighlightsAtom)
  const all = useAtomValue(workbookHighlightsAtom)
  const sync = useSetAtom(syncChartHighlightsAtom)
  useEffect(() => { sync() }, [own, all, sync])
  useEffect(() => () => { sync(true) }, [sync])
  return null
}
