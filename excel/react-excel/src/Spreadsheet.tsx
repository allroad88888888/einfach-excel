import type { CSSProperties, ReactNode } from 'react'
import {
  WorkbookRuntimeProvider,
  type WorkbookRuntimeProviderProps,
} from './page/WorkbookRuntimeProvider'
import { WorkbookView } from './workbook/shell/WorkbookView'
import './style.css'

export interface SpreadsheetProps extends Omit<WorkbookRuntimeProviderProps, 'children'> {
  readonly className?: string
  readonly style?: CSSProperties
}

/** React 只组合完整视图；文档初始化与 Worker 所有权由现有 Core runtime 负责。 */
export function Spreadsheet({ className, style, ...runtime }: SpreadsheetProps): ReactNode {
  return (
    <div className={`einfach-spreadsheet${className ? ` ${className}` : ''}`} style={style}>
      <WorkbookRuntimeProvider {...runtime}>
        <WorkbookView />
      </WorkbookRuntimeProvider>
    </div>
  )
}
