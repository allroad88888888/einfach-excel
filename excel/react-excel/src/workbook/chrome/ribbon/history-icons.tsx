import type { ReactNode } from 'react'

/** 历史工具组的线性图标；笔画规格与格式刷一致，随按钮 color 变色。 */
function HistoryIcon({ children }: { readonly children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

export function UndoIcon() {
  return (
    <HistoryIcon>
      <path d="M5.5 3.5 2.5 6.5l3 3" />
      <path d="M2.5 6.5h7a3.5 3.5 0 0 1 0 7H7" />
    </HistoryIcon>
  )
}

export function RedoIcon() {
  return (
    <HistoryIcon>
      <path d="m10.5 3.5 3 3-3 3" />
      <path d="M13.5 6.5h-7a3.5 3.5 0 0 0 0 7H9" />
    </HistoryIcon>
  )
}

export function RepeatIcon() {
  return (
    <HistoryIcon>
      <path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1" />
      <path d="M13.2 1.8v3h-3" />
    </HistoryIcon>
  )
}

export function RecentOperationsIcon() {
  return (
    <HistoryIcon>
      <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9" />
      <path d="M2.8 1.8v3h3" />
      <path d="M8 5v3l2 1.5" />
    </HistoryIcon>
  )
}
