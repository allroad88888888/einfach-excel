import { useAtomValue } from '@einfach/react'
import { viewportShowHeadingsAtom } from '@einfach-excel/spreadsheet-ui-core'
import { WORKBOOK_GRID_ROW_HEADER_WIDTH, WORKBOOK_GRID_ROW_HEIGHT } from './workbook-grid-config'

/** 行号栏宽（gutter）与列标栏高（heading）；隐藏行列标题时两者为 0。 */
export interface GridGutter {
  readonly gutter: number
  readonly heading: number
}

const SHOWN: GridGutter = {
  gutter: WORKBOOK_GRID_ROW_HEADER_WIDTH, heading: WORKBOOK_GRID_ROW_HEIGHT,
}
const HIDDEN: GridGutter = { gutter: 0, heading: 0 }

/** 网格内所有定位都从这里取标题尺寸，不再各自假定标题总在。 */
export function useGridGutter(): GridGutter {
  return useAtomValue(viewportShowHeadingsAtom) ? SHOWN : HIDDEN
}

/** 非 React 代码（画布视口）从网格框架的 data 属性读取同一份尺寸。 */
export function gridGutterOf(frame: HTMLElement | null): GridGutter {
  if (!frame?.dataset.gutter) return SHOWN
  return { gutter: Number(frame.dataset.gutter), heading: Number(frame.dataset.heading) }
}
