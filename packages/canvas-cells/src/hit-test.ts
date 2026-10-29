import type { CellCoord } from '@einfach-excel/spreadsheet-ui-core'

const hitTests = new WeakMap<Element, (x: number, y: number) => CellCoord | null>()

export function registerHitTest(
  canvas: HTMLCanvasElement, hit: (x: number, y: number) => CellCoord | null,
) {
  hitTests.set(canvas, hit)
  return () => hitTests.delete(canvas)
}
/** Resolve a real Canvas target without creating DOM nodes for individual cells. */
export function canvasCellAt(target: Element | null | undefined, clientX: number, clientY: number) {
  return target ? hitTests.get(target)?.(clientX, clientY) ?? null : null
}
