import { createSignal, type Accessor } from 'solid-js'

type Cancel = () => void

/**
 * Ephemeral DOM coordination for one mounted grid.
 *
 * This deliberately contains only element references, scroll anchors and
 * pointer-listener cleanup. Product state remains in UI-core atoms.
 */
export interface GridDomAdapter {
  readonly gridRoot: Accessor<HTMLDivElement | undefined>
  readonly scrollRoot: Accessor<HTMLDivElement | undefined>
  readonly rowAnchorPx: Accessor<number>
  readonly colAnchorPx: Accessor<number>
  setGridRoot(element: HTMLDivElement | undefined): void
  setScrollRoot(element: HTMLDivElement | undefined): void
  setRowAnchorPx(value: number): void
  setColAnchorPx(value: number): void
  cancelDragSelection(): void
  cancelResize(): void
  cancelFill(): void
  setCancelDragSelection(cancel: Cancel): void
  setCancelResize(cancel: Cancel): void
  setCancelFill(cancel: Cancel): void
}

export function createGridDomAdapter(): GridDomAdapter {
  const [gridRoot, setGridRoot] = createSignal<HTMLDivElement>()
  const [scrollRoot, setScrollRoot] = createSignal<HTMLDivElement>()
  const [rowAnchorPx, setRowAnchorPx] = createSignal(0)
  const [colAnchorPx, setColAnchorPx] = createSignal(0)
  let cancelDragSelection: Cancel = () => undefined
  let cancelResize: Cancel = () => undefined
  let cancelFill: Cancel = () => undefined

  return {
    gridRoot,
    scrollRoot,
    rowAnchorPx,
    colAnchorPx,
    setGridRoot,
    setScrollRoot,
    setRowAnchorPx,
    setColAnchorPx,
    cancelDragSelection: () => cancelDragSelection(),
    cancelResize: () => cancelResize(),
    cancelFill: () => cancelFill(),
    setCancelDragSelection: (cancel) => { cancelDragSelection = cancel },
    setCancelResize: (cancel) => { cancelResize = cancel },
    setCancelFill: (cancel) => { cancelFill = cancel },
  }
}
