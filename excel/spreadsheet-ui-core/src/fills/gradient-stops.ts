import type { SpreadsheetGradientStop } from '../contracts/cell-fill'

/** Sort only the paint view; equal-position records retain their persisted order. */
export function sortedGradientStops(stops: readonly SpreadsheetGradientStop[]):
SpreadsheetGradientStop[] {
  return stops.map(stop => ({ ...stop })).sort((a, b) => a.position - b.position)
}

/** sRGB channel interpolation; the last record wins exactly at a repeated position. */
export function gradientColorAt(
  stops: readonly SpreadsheetGradientStop[], position: number, fallback = '#000000',
): string {
  const sorted = sortedGradientStops(stops)
  if (!sorted.length) return fallback
  let lower = sorted[0]
  if (position < lower.position) return lower.color
  for (const upper of sorted.slice(1)) {
    if (position < upper.position) {
      const ratio = (position - lower.position) / (upper.position - lower.position)
      const startColor = lower.color
      const channels = [1, 3, 5].map(offset => {
        const a = Number.parseInt(startColor.slice(offset, offset + 2), 16)
        const b = Number.parseInt(upper.color.slice(offset, offset + 2), 16)
        return Math.round(a + (b - a) * ratio).toString(16).padStart(2, '0')
      })
      return `#${channels.join('')}`
    }
    lower = upper
  }
  return lower.color
}
