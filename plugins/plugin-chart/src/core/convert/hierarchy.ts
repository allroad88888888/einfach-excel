import type { ChartData } from '../series-layout'
import { slotColor } from './colors'
import { escapeHtml, formatNumber } from './text'
import type { ConvertInput } from './types'

export interface TreeNode {
  readonly name: string
  readonly value: number
  readonly children?: readonly TreeNode[]
}

export interface HierarchyColumns {
  /** 从外到内的层级列，每列是各数据行的单元格显示文本。 */
  readonly levels: readonly (readonly string[])[]
  readonly values: readonly (number | null)[]
}

/**
 * 同 Excel 树状图 / 旭日图的数据约定：前面所有列是层级类别（外层在左），最后一列是数值。
 * 首列在「首列为类别」打开时是类别列，否则它就是第一个系列列。不足一个层级加一个数值列时为 null。
 */
export function hierarchyColumns(data: ChartData): HierarchyColumns | null {
  const last = data.series[data.series.length - 1]
  const levels = [...(data.xValues === null ? [] : [data.categories]),
    ...data.series.slice(0, -1).map((series) => series.labels)]
  return last && levels.length > 0 ? { levels, values: last.values } : null
}

interface Draft {
  own: number
  readonly children: Map<string, Draft>
}

const draft = (): Draft => ({ own: 0, children: new Map() })

function finish(children: Map<string, Draft>): TreeNode[] {
  return [...children].map(([name, node]) => {
    const kids = finish(node.children)
    // 有下级的节点，数值取下级合计；它自己那一行的数值被忽略（树里不会同时有两种口径）。
    return kids.length
      ? { name, value: kids.reduce((sum, kid) => sum + kid.value, 0), children: kids }
      : { name, value: node.own }
  })
}

/**
 * 按层级列建树：同一路径的多行累加；首层空白沿用上一行（合并单元格式的写法）；
 * 路径在第一个空白处截断，数值为空、零或负的行不进树，同 Excel 不画非正数。
 */
export function buildHierarchy(data: ChartData): TreeNode[] {
  const columns = hierarchyColumns(data)
  if (!columns) return []
  const root = draft()
  let outer = ''
  columns.values.forEach((value, row) => {
    const path = columns.levels.map((level) => level[row]?.trim() ?? '')
    if (path[0]) outer = path[0]
    else path[0] = outer
    const cut = path.indexOf('')
    const names = cut < 0 ? path : path.slice(0, cut)
    if (names.length === 0 || value === null || !(value > 0)) return
    let node = root
    for (const name of names) {
      let child = node.children.get(name)
      if (!child) node.children.set(name, child = draft())
      node = child
    }
    node.own += value
  })
  return finish(root.children)
}

/** 外层节点各取一个颜色槽，其下所有层级沿用外层的颜色，同 Excel 按顶层类别着色。 */
export function colorRoots(input: ConvertInput, roots: readonly TreeNode[]) {
  return roots.map((node, index) => ({ ...node, itemStyle: { color: slotColor(input, index) } }))
}

/** 提示框：从外到内的路径加数值。 */
export function hierarchyTooltip(params: unknown): string {
  const item = params as { name?: string; value?: number;
    treePathInfo?: readonly { name?: string }[] }
  const path = (item.treePathInfo ?? []).map((entry) => entry.name ?? '').filter(Boolean)
  const head = escapeHtml((path.length ? path : [item.name ?? '']).join(' / '))
  return typeof item.value === 'number' ? `${head}<br/>${formatNumber(item.value)}` : head
}
