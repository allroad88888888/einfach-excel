import { createContext, useContext } from 'react'

/**
 * 宿主对内置界面区域的显隐配置；缺省全部显示。只影响本挂载的展现，不写入工作簿，
 * 不改变快捷键或宿主 API 的能力。
 */
export interface WorkbookUiOptions {
  /** 标题栏（工作簿名、语言、文件菜单）。 */
  readonly header?: boolean
  readonly ribbon?: boolean
  readonly formulaBar?: boolean
  /** 工作表标签栏。 */
  readonly sheetBar?: boolean
  /** 状态栏（选区统计、缩放）。 */
  readonly statusBar?: boolean
  /** false 关闭单元格右键菜单；`hidden` 按菜单项 id 隐藏内置或插件项。 */
  readonly contextMenu?: false | { readonly hidden?: readonly string[] }
}

export const WorkbookUiOptionsContext = createContext<WorkbookUiOptions>({})

export function useWorkbookUiOptions(): WorkbookUiOptions {
  return useContext(WorkbookUiOptionsContext)
}

/** 右键菜单项是否显示；菜单整体关闭时全部隐藏。 */
export function contextMenuItemShown(options: WorkbookUiOptions, id: string): boolean {
  const menu = options.contextMenu
  return menu !== false && !menu?.hidden?.includes(id)
}
