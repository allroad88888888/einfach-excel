import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { textShrinkBlockedReason, textShrinkScale,
  type SpreadsheetCellFormat } from '@einfach-excel/spreadsheet-ui-core'

/** Measures one mounted cell's unscaled glyphs; the full-width fill gap is not intrinsic text. */
function fittedScale(element: HTMLSpanElement, format: SpreadsheetCellFormat,
  text: string, available: number): number {
  const probe = element.cloneNode(true) as HTMLSpanElement
  probe.setAttribute('aria-hidden', 'true')
  Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', pointerEvents: 'none',
    display: 'inline-block', width: 'max-content', maxWidth: 'none', whiteSpace: 'pre' })
  for (const repeat of probe.querySelectorAll('.cell-fill-repeat')) repeat.remove()
  for (const child of probe.querySelectorAll<HTMLElement>('*')) {
    child.style.transform = 'none'
    if (child.classList.contains('cell-fill-text')) child.style.width = 'max-content'
  }
  element.append(probe)
  try {
    const widthAt = (scale: number) => {
      probe.style.setProperty('--cell-shrink-scale', String(scale))
      // Layout width is unaffected by ancestor zoom/rotation and retains fractional pixels.
      const width = Number.parseFloat(getComputedStyle(probe).width)
      return Number.isFinite(width) ? width : probe.offsetWidth
    }
    return textShrinkScale(format, text, widthAt(1), available, widthAt)
  } finally { probe.remove() }
}

function contentWidth(element: HTMLElement): number {
  const style = getComputedStyle(element)
  const pixels = (value: string) => Number.parseFloat(value) || 0
  const padding = pixels(style.paddingLeft) + pixels(style.paddingRight)
  const width = Number.parseFloat(style.width)
  return Number.isFinite(width) ? width - (style.boxSizing === 'border-box'
    ? padding + pixels(style.borderLeftWidth) + pixels(style.borderRightWidth) : 0)
    : element.clientWidth - padding
}

function formatMeasureKey(format: SpreadsheetCellFormat): string {
  return [
    format.fontFamily ?? '', format.fontSize ?? '', format.bold ? 1 : 0, format.italic ? 1 : 0,
    format.fontBaseline ?? '', format.indent ?? '', format.rotation ?? '',
    format.shrinkToFit ? 1 : 0, format.overflow ?? '', format.wrap ? 1 : 0,
  ].join('|')
}

function ShrinkToFitText({ children, text, format }: {
  children: ReactNode; text: string; format: SpreadsheetCellFormat
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const latestRef = useRef({ text, format })
  latestRef.current = { text, format }
  const measuredRef = useRef<{
    text: string; formatKey: string; html: string; availableWidth: number; cellFontSize: string
  } | null>(null)
  const measureRef = useRef<() => void>(() => {})
  measureRef.current = () => {
    const element = ref.current
    const content = element?.closest<HTMLElement>('.cell-content')
    const cell = element?.closest<HTMLElement>('.cell')
    if (!element || !content || !cell) return
    const current = latestRef.current
    const cellFontSize = getComputedStyle(cell).fontSize
    const availableWidth = contentWidth(content)
    element.style.setProperty('--cell-shrink-font-size', cellFontSize)
    const scale = fittedScale(element, current.format, current.text, availableWidth)
    element.style.setProperty('--cell-shrink-scale', String(scale))
    element.dataset.shrinkScale = String(scale)
    measuredRef.current = {
      text: current.text,
      formatKey: formatMeasureKey(current.format),
      html: element.innerHTML,
      availableWidth,
      cellFontSize,
    }
  }
  useLayoutEffect(() => {
    const element = ref.current
    const content = element?.closest<HTMLElement>('.cell-content')
    if (!element || !content) return
    let disposed = false, frame = 0
    const run = () => { frame = 0; if (!disposed) measureRef.current() }
    const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(run) }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    observer?.observe(content)
    const fonts = element.ownerDocument.fonts
    fonts?.addEventListener('loadingdone', schedule)
    if (fonts && fonts.status !== 'loaded') void fonts.ready.then(schedule)
    measureRef.current()
    return () => {
      disposed = true
      if (frame) cancelAnimationFrame(frame)
      observer?.disconnect()
      fonts?.removeEventListener('loadingdone', schedule)
    }
  }, [])
  useLayoutEffect(() => {
    const element = ref.current
    const content = element?.closest<HTMLElement>('.cell-content')
    const cell = element?.closest<HTMLElement>('.cell')
    if (!element || !content || !cell) return
    const formatKey = formatMeasureKey(format)
    const previous = measuredRef.current
    if (previous && previous.text === text && previous.formatKey === formatKey &&
      previous.html === element.innerHTML &&
      Math.abs(previous.availableWidth - contentWidth(content)) < 0.25 &&
      previous.cellFontSize === getComputedStyle(cell).fontSize) return
    measureRef.current()
  })
  return <span ref={ref} data-shrink-to-fit="true" style={{ display: 'block', width: '100%',
    fontSize: 'calc(var(--cell-shrink-font-size, 1em) * var(--cell-shrink-scale, 1))',
    lineHeight: 1.2 }}>{children}</span>
}

/** Ordinary cells retain their direct text path and allocate no observer or measurement element. */
export function shrinkToFitText(
  children: ReactNode, text: string, format: SpreadsheetCellFormat | undefined,
): ReactNode {
  return (format?.shrinkToFit || format?.overflow === 'shrink-to-fit') &&
    !textShrinkBlockedReason(format, text)
    ? <ShrinkToFitText text={text} format={format}>{children}</ShrinkToFitText> : children
}
