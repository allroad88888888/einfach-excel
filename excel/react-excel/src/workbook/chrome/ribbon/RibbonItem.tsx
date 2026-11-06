import type { ReactNode } from 'react'
import { ribbonItemShown, useWorkbookUiOptions } from '../../../page/workbook-ui-options'

/** Only the trigger is conditional; its owner keeps command state and panels mounted. */
export function RibbonItem({
  id,
  children,
}: {
  readonly id: string
  readonly children: ReactNode
}) {
  return ribbonItemShown(useWorkbookUiOptions(), id) ? children : null
}
