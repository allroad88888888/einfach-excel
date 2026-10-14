import { useStore } from '@einfach/react'
import { createCanvasCells, type CanvasCellsInput } from '@einfach/canvas-cells'
import { useLayoutEffect, useRef } from 'react'

/** React only owns the canvas element; the renderer owns its cell lifetimes and subscriptions. */
export function CanvasCells(input: CanvasCellsInput) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<ReturnType<typeof createCanvasCells>>()
  const latest = useRef(input)
  latest.current = input
  const store = useStore()
  useLayoutEffect(() => {
    const element = canvas.current!
    const style = getComputedStyle(element)
    const color = (name: string, fallback: string) =>
      style.getPropertyValue(name).trim() || fallback
    const view = createCanvasCells(element, latest.current, { store,
      theme: { background: color('--surface', '#fff'),
        foreground: color('--text', '#252b37'),
        gridline: color('--gridline', '#dce1e8'), selection: color('--primary', '#315cda') },
      onFrame: stats => { element.dataset.paintedCells = String(stats.cells) },
    })
    renderer.current = view
    view.flush()
    return () => { renderer.current = undefined; view.dispose() }
  }, [store])
  useLayoutEffect(() => {
    renderer.current?.update(input)
    // Position, backing-store resize and pixels must be ready in the same browser paint.
    renderer.current?.flush()
  }, [input])
  return <canvas ref={canvas} aria-label="Canvas worksheet cells" role="img"
    style={{ display: 'block', touchAction: 'none' }} />
}
