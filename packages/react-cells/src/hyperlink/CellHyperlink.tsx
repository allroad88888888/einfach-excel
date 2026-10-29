import { externalHyperlink } from '@einfach-excel/spreadsheet-ui-core'
import type { ReactNode } from 'react'

/** 链接外观只作用于文字；不修改原有 cellStyle，移除链接即可恢复原样。 */
export function CellHyperlink({ url, color, children }: {
  url?: string; color?: string; children: ReactNode
}) {
  const href = externalHyperlink(url)
  if (!href) return <>{children}</>
  return <a href={href} target="_blank" rel="noopener noreferrer" tabIndex={-1}
    title={href} data-cell-hyperlink="true"
    style={{ color: color ?? 'var(--primary, #315cda)', textDecoration: 'underline' }}
    onClick={(event) => event.preventDefault()}>{children}</a>
}
