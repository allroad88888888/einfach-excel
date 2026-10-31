export interface TabSheet {
  readonly id: string
  readonly index: number
  readonly hidden?: boolean
}

export function visibleSheets<T extends TabSheet>(sheets: readonly T[]): T[] {
  return sheets.filter((sheet) => !sheet.hidden)
}

export function hiddenSheets<T extends TabSheet>(sheets: readonly T[]): T[] {
  return sheets.filter((sheet) => sheet.hidden)
}

/** 隐藏当前表后落到的表：优先右侧最近的可见表，否则左侧最近的。 */
export function nearestVisibleSheet<T extends TabSheet>(
  sheets: readonly T[],
  index: number,
  excludeId?: string,
): T | null {
  const candidates = visibleSheets(sheets).filter((sheet) => sheet.id !== excludeId)
  const right = candidates.find((sheet) => sheet.index > index)
  return right ?? candidates[candidates.length - 1] ?? null
}

/** 标签导航与 Ctrl+PageUp/PageDown 共用：只在可见表之间移动，不循环。 */
export function adjacentVisibleSheet<T extends TabSheet>(
  sheets: readonly T[],
  activeId: string | null,
  direction: 'previous' | 'next',
): T | null {
  const visible = visibleSheets(sheets)
  const position = visible.findIndex((sheet) => sheet.id === activeId)
  if (position < 0) return null
  return visible[position + (direction === 'next' ? 1 : -1)] ?? null
}
