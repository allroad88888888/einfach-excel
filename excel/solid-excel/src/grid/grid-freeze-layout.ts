import { GRID_ROW_HEADER_WIDTH } from './grid-constants'

interface GridFreezeLayoutInput {
  hasColOutline: () => boolean
  hasRowOutline: () => boolean
  getColOutlineBandHeight: () => number
  getRowOutlineGutterWidth: () => number
  freezeRowCount: () => number
  freezeColCount: () => number
  showHeadings: () => boolean
  getViewportRowHeight: () => number
  getRenderedColumnWidth: (col: number) => number
  getRenderedRowHeight: (row: number) => number
  getRowSpanHeight: (start: number, end: number) => number
  getColumnSpanWidth: (start: number, end: number) => number
}

/** Computes sticky offsets and freeze boundaries from atom-backed geometry. */
export function createGridFreezeLayout(input: GridFreezeLayoutInput) {
  function getFrozenRowTop(row: number) {
    const headingHeight = input.showHeadings() ? input.getViewportRowHeight() : 0
    const stackedAbove = row === 0 ? 0 : input.getRowSpanHeight(0, row - 1)
    return input.getColOutlineBandHeight() + headingHeight + stackedAbove
  }

  function getFrozenColumnLeft(col: number) {
    const headingWidth = input.showHeadings() ? GRID_ROW_HEADER_WIDTH : 0
    const stackedLeft = col === 0 ? 0 : input.getColumnSpanWidth(0, col - 1)
    return input.getRowOutlineGutterWidth() + headingWidth + stackedLeft
  }

  function getColumnStyle(col: number): Record<string, string> {
    const style: Record<string, string> = { width: `${input.getRenderedColumnWidth(col)}px` }
    if (input.hasColOutline()) style.top = `${input.getColOutlineBandHeight()}px`
    if (col < input.freezeColCount()) style.left = `${getFrozenColumnLeft(col)}px`
    return style
  }

  function getFrozenStickyStyle(row: number, col: number): Record<string, string> {
    const style: Record<string, string> = {}
    if (row < input.freezeRowCount()) style.top = `${getFrozenRowTop(row)}px`
    if (col < input.freezeColCount()) style.left = `${getFrozenColumnLeft(col)}px`
    return style
  }

  function getRowHeaderStyle(row: number): Record<string, string> {
    const style: Record<string, string> = { height: `${input.getRenderedRowHeight(row)}px` }
    if (input.hasRowOutline()) style.left = `${input.getRowOutlineGutterWidth()}px`
    if (row < input.freezeRowCount()) style.top = `${getFrozenRowTop(row)}px`
    return style
  }

  function getCornerStyle(): Record<string, string> {
    const style: Record<string, string> = {}
    if (input.hasRowOutline()) style.left = `${input.getRowOutlineGutterWidth()}px`
    if (input.hasColOutline()) style.top = `${input.getColOutlineBandHeight()}px`
    return style
  }

  function getFreezeBoundaryY() {
    const frozenRows = input.freezeRowCount()
    return frozenRows === 0
      ? 0
      : input.getColOutlineBandHeight() +
          (input.showHeadings() ? input.getViewportRowHeight() : 0) +
          input.getRowSpanHeight(0, frozenRows - 1)
  }

  function getFreezeBoundaryX() {
    const frozenCols = input.freezeColCount()
    return frozenCols === 0
      ? 0
      : input.getRowOutlineGutterWidth() +
          (input.showHeadings() ? GRID_ROW_HEADER_WIDTH : 0) +
          input.getColumnSpanWidth(0, frozenCols - 1)
  }

  return {
    getColumnStyle,
    getFrozenStickyStyle,
    getRowHeaderStyle,
    getCornerStyle,
    getFreezeBoundaryY,
    getFreezeBoundaryX,
  }
}
