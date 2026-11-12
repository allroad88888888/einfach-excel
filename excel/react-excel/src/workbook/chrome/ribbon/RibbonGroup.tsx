import type { WorkbookRibbonGroup } from './ribbon-groups'

/**
 * 一组工具的容器。inactive 只藏入口：组件保持挂载，快捷键打开的弹窗仍可显示。
 */
export function RibbonGroup({
  group,
  inactive,
}: {
  readonly group: WorkbookRibbonGroup
  readonly inactive: boolean
}) {
  const { Content } = group
  return (
    <div
      className="ribbon-tool-group"
      data-ribbon-group={group.id}
      data-ribbon-tab={group.tab}
      data-layout={group.layout}
      data-plugin={group.plugin}
      data-inactive={inactive}
    >
      <Content />
    </div>
  )
}
