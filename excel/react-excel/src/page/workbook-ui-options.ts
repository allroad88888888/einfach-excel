import { createContext, useContext } from 'react'

/**
 * 宿主对内置界面区域的显隐配置；缺省全部显示。只影响本挂载的展现，不写入工作簿，
 * 不改变快捷键或宿主 API 的能力。
 */
export interface WorkbookUiOptions {
  /** 标题栏（工作簿名、语言、文件菜单）。 */
  readonly header?: boolean
  /** false 隐藏整个功能区；hidden 使用 workbookRibbonItemIds 中的稳定 ID。 */
  readonly ribbon?: boolean | { readonly hidden?: readonly string[] }
  /** 行号栏宽、列标栏高（px，0–512）；只影响本挂载，文件不保存。 */
  readonly rowHeaderWidth?: number
  readonly columnHeaderHeight?: number
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

/** 隐藏入口不撤销快捷键/API，也不卸载已经打开的面板。 */
export function ribbonItemShown(options: WorkbookUiOptions, id: string): boolean {
  const ribbon = options.ribbon
  return ribbon !== false && (typeof ribbon !== 'object' || !ribbon.hidden?.includes(id))
}

export function headerDimension(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value! >= 0 && value! <= 512 ? value! : fallback
}
