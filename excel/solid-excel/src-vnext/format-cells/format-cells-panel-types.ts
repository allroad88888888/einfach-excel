import type { Accessor } from 'solid-js'
import type { FormatCellsDraft } from '@einfach/spreadsheet-ui-core'

export interface FormatCellsPanelProps {
  readonly draft: Accessor<FormatCellsDraft | null>
  readonly patch: (next: Partial<FormatCellsDraft>) => void
  readonly t: (id: string, values?: Record<string, unknown>) => string
}
