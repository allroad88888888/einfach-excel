import type { ToolbarActiveSurface, ToolbarDropdownKind, ToolbarPaletteKind } from './types'

export function isToolbarDropdownKind(
  value: ToolbarActiveSurface['id'],
): value is ToolbarDropdownKind {
  return (
    value === 'alignment' ||
    value === 'vertical-alignment' ||
    value === 'number-format' ||
    value === 'border' ||
    value === 'merge' ||
    value === 'font-family' ||
    value === 'font-size' ||
    value === 'rotation' ||
    value === 'sort'
  )
}

export function isToolbarPaletteKind(
  value: ToolbarActiveSurface['id'],
): value is ToolbarPaletteKind {
  return value === 'text-color' || value === 'fill-color'
}
