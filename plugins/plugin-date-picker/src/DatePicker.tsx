import { useId, useLayoutEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { datePickerStateAtom, runDatePickerAtom } from './core'
import { labels } from './messages'
import { bindDatePickerShortcut, DATE_PICKER_SHORTCUT } from './picker-shortcut'
import './date-picker.css'

/** A native calendar keeps platform keyboard support, locale and popup placement. */
export function DatePicker() {
  const { i18n } = useLingui()
  const state = useAtomValue(datePickerStateAtom)
  const run = useSetAtom(runDatePickerAtom)
  const id = useId()
  const regionRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    const region = regionRef.current
    const parent = region?.parentElement
    if (!region || !parent) return
    const workbook = parent.closest('.workbook')
    const place = () => {
      const box = parent.getBoundingClientRect()
      const viewport = parent.closest('.sheet-scroll')?.getBoundingClientRect()
      const right = Math.min(window.innerWidth - 12, viewport?.right ?? window.innerWidth - 12)
      const bottom = Math.min(window.innerHeight - 12, viewport?.bottom ?? window.innerHeight - 12)
      const width = region.getBoundingClientRect().width
      region.style.left = `${Math.min(0, Math.max(12 - box.left, right - box.left - width))}px`
      region.style.top = box.bottom + region.offsetHeight + 4 > bottom
        ? `${-region.offsetHeight - 4}px` : 'calc(100% + 4px)'
    }
    place()
    const unbind = inputRef.current ? bindDatePickerShortcut(parent, inputRef.current) : undefined
    const observer = new ResizeObserver(place)
    observer.observe(parent)
    window.addEventListener('resize', place)
    workbook?.addEventListener('scroll', place, true)
    return () => {
      unbind?.()
      observer.disconnect()
      window.removeEventListener('resize', place)
      workbook?.removeEventListener('scroll', place, true)
    }
  }, [state.visible])
  if (!state.visible) return null
  const finish = async (action: 'apply' | 'cancel') => {
    const region = regionRef.current
    const grid = region?.closest('.workbook')?.querySelector<HTMLElement>('[data-workbook-grid]')
    const result = await run(action)
    if ((result === true || result === 'completed') &&
      (document.activeElement === document.body || region?.contains(document.activeElement)))
      grid?.focus({ preventScroll: true })
  }
  return <form ref={regionRef} className="einfach-date-picker" aria-label={i18n._(labels.picker)}
    onPointerDown={(event) => event.stopPropagation()}
    onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void finish('apply') }}
    onKeyDown={(event) => {
      event.stopPropagation()
      if (event.key === 'Escape') { event.preventDefault(); void finish('cancel') }
      // 外层编辑器会拦下隐式提交；日历里按 Enter 明确走「使用日期」，键盘可完成整个流程。
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement && state.valid) {
        event.preventDefault()
        void finish('apply')
      }
    }}>
    <label className="date-picker-label" htmlFor={id}>{i18n._(labels.date)}</label>
    <input ref={inputRef} id={id} type="date" min="1900-01-01" max="9999-12-31"
      value={state.value} aria-keyshortcuts={DATE_PICKER_SHORTCUT}
      title={i18n._(labels.shortcut)}
      disabled={state.busy} onChange={(event) => run({ value: event.currentTarget.value })} />
    <button type="submit" disabled={state.busy || !state.valid}>{i18n._(labels.apply)}</button>
    <button type="button" disabled={state.busy} aria-label={i18n._(labels.cancel)}
      title={i18n._(labels.cancel)} onClick={() => void finish('cancel')}>×</button>
  </form>
}
