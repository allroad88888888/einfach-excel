import type { WritableAtom } from '@einfach/core'
import type { MessageDescriptor, Messages } from '@lingui/core'
import type { WorkbookRibbonTab } from '@einfach-excel/spreadsheet-ui-core'
import type { ComponentType } from 'react'
import type { UiLocale } from '../i18n/runtime'

/** 功能区分组：`tab: 'Start'` 只在全部视图出现，其余分类同时出现在全部视图与该分类。 */
export interface RibbonContribution {
  readonly id: string
  readonly tab: WorkbookRibbonTab
  readonly Group: ComponentType
}

/** 右键菜单项：一个菜单项派发一个零参数公开命令 atom，参数在插件 Core 内取。 */
export interface ContextMenuContribution {
  readonly id: string
  readonly label: MessageDescriptor
  readonly command: WritableAtom<unknown, [], unknown>
}

/**
 * 可选功能包向工作簿贡献的界面入口。插件状态与命令放在插件自己的 Core 入口，
 * 这里只声明挂载位置；工作簿核心不 import 任何插件。
 */
export interface SpreadsheetPlugin {
  readonly id: string
  readonly ribbon?: readonly RibbonContribution[]
  readonly contextMenu?: readonly ContextMenuContribution[]
  /** 当前格内编辑器或公式栏内部挂件；共享失焦提交范围。 */
  readonly editorAdornments?: readonly ComponentType[]
  /** 对话框与面板，挂在工作簿视图根部。 */
  readonly panels?: readonly ComponentType[]
  /** 已编译的 Lingui 目录，合并进工作簿自己的 i18n 实例。 */
  readonly messages?: Partial<Record<UiLocale, Messages>>
}
