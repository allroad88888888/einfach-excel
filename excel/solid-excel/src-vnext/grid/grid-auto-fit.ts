const AUTO_FIT_CELL_PADDING_PX = 16
const AUTO_FIT_ROW_PADDING_PX = 4

export function clampDimension(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : min
}

function parseCssPx(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value ?? '')
  return Number.isFinite(parsed) ? parsed : 0
}

function fallbackTextWidth(text: string, style: CSSStyleDeclaration): number {
  return Math.max(1, Array.from(text).length) * (parseCssPx(style.fontSize) || 12) * 0.62
}

function measureTextBox(source: HTMLElement, text: string): { width: number; height: number; style: CSSStyleDeclaration } {
  const style = window.getComputedStyle(source)
  const probe = document.createElement('span')
  probe.textContent = text || ' '
  Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre', font: style.font, fontSize: style.fontSize, fontFamily: style.fontFamily, fontWeight: style.fontWeight, fontStyle: style.fontStyle, letterSpacing: style.letterSpacing })
  document.body.appendChild(probe)
  const rect = probe.getBoundingClientRect()
  probe.remove()
  const fontSize = parseCssPx(style.fontSize) || 12
  return { width: rect.width > 0 ? rect.width : fallbackTextWidth(text, style), height: rect.height > 0 ? rect.height : Math.max(parseCssPx(style.lineHeight), fontSize * 1.25), style }
}

export function measureAutoFitWidth(source: HTMLElement): number {
  const { width, style } = measureTextBox(source, source.textContent ?? '')
  return width + parseCssPx(style.paddingLeft) + parseCssPx(style.paddingRight) + AUTO_FIT_CELL_PADDING_PX
}

export function measureAutoFitHeight(source: HTMLElement): number {
  const { height, style } = measureTextBox(source, source.textContent ?? '')
  return height + parseCssPx(style.paddingTop) + parseCssPx(style.paddingBottom) + AUTO_FIT_ROW_PADDING_PX
}
