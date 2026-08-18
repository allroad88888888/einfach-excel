import {
  collapseOutlineToLevelAtom,
  getOutlineLeveledGroupsForSheet,
  getOutlineMaxLevelForSheet,
  toggleOutlineGroupCollapsedAtom,
  type OutlineAxis,
  type OutlineGroupWithLevel,
} from '@einfach/spreadsheet-ui-core'
import {
  GRID_ROW_HEADER_WIDTH,
  OUTLINE_GUTTER_PADDING_PX,
  OUTLINE_GUTTER_SLOT_PX,
} from './grid-constants'
import { installGridFeature, type GridRuntimeBase } from './grid-runtime'
import type { GridFocusPort, GridOutlineLayoutPort } from './grid-runtime-ports'
import type { GridViewStateApi } from './grid-view-state'

type GridOutlineStateRuntime = GridRuntimeBase &
  Pick<GridViewStateApi, 'viewportMetrics'> &
  GridFocusPort &
  GridOutlineLayoutPort

export function installGridOutlineState(runtime: GridOutlineStateRuntime) {
  const { props, store, backend, atoms, viewportMetrics } = runtime

  function outlineState() {
    return atoms.outlineState()
  }

  function getOutlineGroups(axis: OutlineAxis): readonly OutlineGroupWithLevel[] {
    return getOutlineLeveledGroupsForSheet(outlineState(), props.sheetId, axis)
  }

  function hasRowOutline(): boolean {
    return getOutlineGroups('row').length > 0
  }

  function hasColOutline(): boolean {
    return getOutlineGroups('column').length > 0
  }

  function getOutlineMaxLevel(axis: OutlineAxis): number {
    return getOutlineMaxLevelForSheet(outlineState(), props.sheetId, axis)
  }

  function getRowOutlineGutterWidth(): number {
    return hasRowOutline()
      ? getOutlineMaxLevel('row') * OUTLINE_GUTTER_SLOT_PX + OUTLINE_GUTTER_PADDING_PX
      : 0
  }

  function getColOutlineBandHeight(): number {
    return hasColOutline()
      ? getOutlineMaxLevel('column') * OUTLINE_GUTTER_SLOT_PX + OUTLINE_GUTTER_PADDING_PX
      : 0
  }

  function getOutlineLevelSlots(axis: OutlineAxis): number[] {
    return Array.from({ length: getOutlineMaxLevel(axis) }, (_, index) => index + 1)
  }

  function getOutlineLevelButtons(axis: OutlineAxis): number[] {
    return Array.from({ length: getOutlineMaxLevel(axis) + 1 }, (_, index) => index + 1)
  }

  function getOutlineToggleAt(axis: OutlineAxis, index: number, level: number) {
    return getOutlineGroups(axis).find((group) => group.end + 1 === index && group.level === level)
  }

  function outlineSlotHasLine(axis: OutlineAxis, index: number, level: number): boolean {
    return getOutlineGroups(axis).some(
      (group) =>
        !group.collapsed && group.level === level && index >= group.start && index <= group.end,
    )
  }

  function toggleOutlineGroup(axis: OutlineAxis, group: OutlineGroupWithLevel) {
    store.setter(toggleOutlineGroupCollapsedAtom, {
      sheetId: props.sheetId,
      axis,
      start: group.start,
      end: group.end,
      level: group.level,
      source: backend,
    })
    runtime.focusGrid()
  }

  function collapseOutlineLevel(axis: OutlineAxis, level: number) {
    store.setter(collapseOutlineToLevelAtom, {
      sheetId: props.sheetId,
      axis,
      level,
      source: backend,
    })
    runtime.focusGrid()
  }

  function freezeRowCount(): number {
    return atoms.viewportFreeze().rowsBySheet[props.sheetId] ?? 0
  }

  function freezeColCount(): number {
    return atoms.viewportFreeze().colsBySheet[props.sheetId] ?? 0
  }

  function getFreezeBoundaryY(): number {
    const rows = freezeRowCount()
    if (rows <= 0) return 0
    const gridRoot = runtime.dom.gridRoot()
    const scrollRoot = runtime.dom.scrollRoot()
    if (gridRoot && scrollRoot) {
      const rootRect = scrollRoot.getBoundingClientRect()
      if (rootRect.height > 0) {
        const lastFrozen = gridRoot.querySelector(
          `td.spreadsheet-grid-cell[data-row="${rows - 1}"]`,
        ) as HTMLElement | null
        if (lastFrozen) return lastFrozen.getBoundingClientRect().bottom - rootRect.top
      }
    }
    return (
      (showHeadings() ? viewportMetrics().rowHeight : 0) + runtime.getRowSpanHeight(0, rows - 1)
    )
  }

  function getFreezeBoundaryX(): number {
    const cols = freezeColCount()
    if (cols <= 0) return 0
    const gridRoot = runtime.dom.gridRoot()
    const scrollRoot = runtime.dom.scrollRoot()
    if (gridRoot && scrollRoot) {
      const rootRect = scrollRoot.getBoundingClientRect()
      if (rootRect.width > 0) {
        const lastFrozen = gridRoot.querySelector(
          `td.spreadsheet-grid-cell[data-col="${cols - 1}"]`,
        ) as HTMLElement | null
        if (lastFrozen) return lastFrozen.getBoundingClientRect().right - rootRect.left
      }
    }
    return (showHeadings() ? GRID_ROW_HEADER_WIDTH : 0) + runtime.getColumnSpanWidth(0, cols - 1)
  }

  function showGridlines() {
    return atoms.showGridlines()
  }

  function showHeadings() {
    return atoms.showHeadings()
  }

  return installGridFeature(runtime, {
    outlineState,
    getOutlineGroups,
    hasRowOutline,
    hasColOutline,
    getOutlineMaxLevel,
    getRowOutlineGutterWidth,
    getColOutlineBandHeight,
    getOutlineLevelSlots,
    getOutlineLevelButtons,
    getOutlineToggleAt,
    outlineSlotHasLine,
    toggleOutlineGroup,
    collapseOutlineLevel,
    freezeRowCount,
    freezeColCount,
    getFreezeBoundaryY,
    getFreezeBoundaryX,
    showGridlines,
    showHeadings,
  })
}

export type GridOutlineStateApi = ReturnType<typeof installGridOutlineState>
