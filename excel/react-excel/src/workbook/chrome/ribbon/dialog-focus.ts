import type { KeyboardEvent } from 'react'

/** 在弹窗首尾控件之间循环，避免原生 dialog 把 Tab 焦点送进浏览器地址栏。 */
export function cycleDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return
  const controls = event.currentTarget.querySelectorAll<HTMLElement>(
    'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), ' +
    'select:not(:disabled), textarea:not(:disabled), a[href]:not([tabindex="-1"])',
  )
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (event.shiftKey ? event.target !== first : event.target !== last) return
  event.preventDefault()
  ;(event.shiftKey ? last : first)?.focus()
}
