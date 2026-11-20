import type { ReactNode } from 'react'
import { ribbonItemShown, useWorkbookUiOptions } from '../../../page/workbook-ui-options'
import { RibbonItemContributions } from '../../../plugin/RibbonItemContributions'

/** Only the trigger is conditional; its owner keeps command state and panels mounted. */
export function RibbonItem({
  id,
  children,
}: {
  readonly id: string
  readonly children: ReactNode
}) {
  const shown = ribbonItemShown(useWorkbookUiOptions(), id)
  return <>{shown ? children : null}<RibbonItemContributions after={id} /></>
}
