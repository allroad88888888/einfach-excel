import { externalHyperlink, internalHyperlink } from '@einfach-excel/spreadsheet-ui-core'
import type { ReactNode } from 'react'

/** 链接外观只作用于文字；外部地址带 noopener，内部位置走工作簿内跳转且不打开新窗口。 */
export function CellHyperlink({ url, color, children }: {
  url?: string; color?: string; children: ReactNode
}) {
  const external = externalHyperlink(url)
  const internal = external ? null : internalHyperlink(url)
  const href = external ?? internal
  if (!href) return <>{children}</>
  return <a href={href}
    {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : { 'data-hyperlink-kind': 'internal' })}
    tabIndex={-1}
    title={href} data-cell-hyperlink="true"
    style={{ color: color ?? 'var(--primary, #315cda)', textDecoration: 'underline' }}
    onClick={(event) => event.preventDefault()}>{children}</a>
}
