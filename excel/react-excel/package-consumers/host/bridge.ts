import type {
  ConfigureHostControlsResult,
  HostControls,
  ReadWorkbookRangesInput,
  ReadWorkbookRangesResult,
  WorkbookChangeEvent,
  WorkbookDocumentSheet,
  WriteWorkbookCellsInput,
  WriteWorkbookCellsResult,
} from '@einfach-excel/spreadsheet-ui-core'

type Instance = 'first' | 'second'

/** 仅描述消费者的测试观测口；不把已装 React 入口反向拉进仓内源码类型检查。 */
export interface PackageHost {
  workers: { created: number; terminated: number; live: number; customCalls: number }
  events: Record<Instance, WorkbookChangeEvent[]>
  before: string[][]
  style(): string[][]
  read(input: ReadWorkbookRangesInput, key?: Instance): Promise<ReadWorkbookRangesResult>
  write(input: WriteWorkbookCellsInput, key?: Instance): Promise<WriteWorkbookCellsResult>
  controls(input: Partial<HostControls>, key?: Instance): Promise<ConfigureHostControlsResult>
  currentControls(): HostControls
  sheets(): readonly WorkbookDocumentSheet[]
  export(): Promise<{ readonly text: string; readonly filename: string }>
  replace(text: string | null): Promise<boolean>
}

declare global {
  interface Window {
    packageHost: PackageHost
  }
}
