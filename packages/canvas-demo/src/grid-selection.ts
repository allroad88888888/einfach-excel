import { atom, type Store } from '@einfach/core'
import {
  onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPointerEnter, onPointerLeave,
  type CellPointerEvent,
} from '@einfach/canvas'

export interface GridAppearance {
  hovered: boolean
  selected: boolean
  active: boolean
  edges: number // top=1, right=2, bottom=4, left=8
}

export function createGridAtom(index: number) {
  return atom({ value: index % 100, hovered: false, selected: false, active: false, edges: 0 })
}

interface SelectionState {
  hover: number | null
  anchor: number | null
  focus: number | null
  pointer: number | null
}

export interface SelectionInfo { hover: string; range: string; count: number }

const empty: SelectionState = { hover: null, anchor: null, focus: null, pointer: null }

export function createGridSelection(
  canvas: HTMLCanvasElement, store: Store,
  getCell: (index: number) => ReturnType<typeof createGridAtom>,
  rows: () => number, report: (info: SelectionInfo) => void,
) {
  const columns = 20
  const stateAtom = atom<SelectionState>(empty)
  const state = () => store.getter(stateAtom)
  let disposed = false
  let releaseDrag: (() => void) | undefined
  function address(index: number) {
    return `${String.fromCharCode(65 + index % columns)}${Math.floor(index / columns) + 1}`
  }
  function range(value: SelectionState) {
    if (value.anchor === null || value.focus === null) return null
    return {
      top: Math.floor(Math.min(value.anchor, value.focus) / columns),
      bottom: Math.floor(Math.max(value.anchor, value.focus) / columns),
      left: Math.min(value.anchor % columns, value.focus % columns),
      right: Math.max(value.anchor % columns, value.focus % columns),
    }
  }
  function appearance(index: number, value: SelectionState): GridAppearance {
    const bounds = range(value)
    const row = Math.floor(index / columns), col = index % columns
    const selected = Boolean(bounds && row >= bounds.top && row <= bounds.bottom
      && col >= bounds.left && col <= bounds.right)
    let edges = 0
    if (selected && bounds) {
      if (row === bounds.top) edges |= 1
      if (col === bounds.right) edges |= 2
      if (row === bounds.bottom) edges |= 4
      if (col === bounds.left) edges |= 8
    }
    return { hovered: value.hover === index, selected, active: value.anchor === index, edges }
  }
  function notify(value: SelectionState) {
    const bounds = range(value)
    report({
      hover: value.hover === null ? '—' : address(value.hover),
      range: bounds
        ? `${address(bounds.top * columns + bounds.left)}:${address(bounds.bottom * columns + bounds.right)}`
        : '—',
      count: bounds ? (bounds.bottom - bounds.top + 1) * (bounds.right - bounds.left + 1) : 0,
    })
  }
  function change(next: SelectionState) {
    if (disposed) return
    const previous = state()
    if (next.hover === previous.hover && next.anchor === previous.anchor
      && next.focus === previous.focus && next.pointer === previous.pointer) return
    store.setter(stateAtom, next)
    for (let index = 0; index < rows() * columns; index++) {
      const before = appearance(index, previous), after = appearance(index, next)
      if (before.hovered === after.hovered && before.selected === after.selected
        && before.active === after.active && before.edges === after.edges) continue
      const entity = getCell(index)
      store.setter(entity, { ...store.getter(entity), ...after })
    }
    notify(next)
  }
  function indexAt(event: CellPointerEvent) {
    const column = Math.max(0, Math.min(columns - 1, Math.floor(event.x / 60)))
    const row = Math.max(0, Math.min(rows() - 1, Math.floor(event.y / 34)))
    return row * columns + column
  }
  function stop() {
    releaseDrag?.()
    releaseDrag = undefined
    change({ ...state(), pointer: null })
  }
  function enter(event: CellPointerEvent) {
    if (event.nativeEvent.isPrimary && event.nativeEvent.pointerType !== 'touch') {
      change({ ...state(), hover: indexAt(event) })
    }
  }
  function leave(event: CellPointerEvent) {
    if (event.nativeEvent.isPrimary) change({ ...state(), hover: null })
  }
  function down(event: CellPointerEvent) {
    if (!event.nativeEvent.isPrimary || event.nativeEvent.button !== 0) return
    if (state().pointer !== null) return
    event.nativeEvent.preventDefault()
    canvas.focus({ preventScroll: true })
    event.capturePointer()
    releaseDrag = event.releasePointer
    const index = indexAt(event)
    change({ ...state(), anchor: event.nativeEvent.shiftKey ? state().anchor ?? index : index,
      focus: index, pointer: event.nativeEvent.pointerId })
  }
  function move(event: CellPointerEvent) {
    if (state().pointer !== event.nativeEvent.pointerId) return
    if (!(event.nativeEvent.buttons & 1)) { stop(); return }
    change({ ...state(), focus: indexAt(event) })
  }
  function up(event: CellPointerEvent) {
    if (state().pointer !== event.nativeEvent.pointerId) return
    change({ ...state(), focus: indexAt(event) })
    stop()
  }
  function cancel(event: CellPointerEvent) {
    if (state().pointer === event.nativeEvent.pointerId) stop()
  }
  function clear() {
    releaseDrag?.()
    releaseDrag = undefined
    change({ ...empty, hover: state().hover })
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); clear() }
  }
  canvas.addEventListener('keydown', keydown)
  notify(empty)
  return {
    bindCell() {
      onPointerEnter(enter)
      onPointerLeave(leave)
      onPointerDown(down)
      onPointerMove(move)
      onPointerUp(up)
      onPointerCancel(cancel)
    },
    clear,
    reset() { clear(); change(empty) },
    dispose() {
      disposed = true
      releaseDrag?.()
      releaseDrag = undefined
      canvas.removeEventListener('keydown', keydown)
      notify(empty)
    },
  }
}
