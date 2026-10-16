import { useLingui } from '@lingui/react/macro'
import { useStore } from '@einfach/react'
import { createCanvasCells, type CanvasCellsInput } from '@einfach/canvas-cells'
import { useLayoutEffect, useRef } from 'react'
import { bindCanvasViewport } from './canvas-viewport'

/** React only owns the canvas element; the renderer owns its cell lifetimes and subscriptions. */
export function CanvasCells(input: CanvasCellsInput) {
  const { t } = useLingui()
  const canvas = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<ReturnType<typeof createCanvasCells>>()
  const viewport = useRef<ReturnType<typeof bindCanvasViewport>>()
  const latest = useRef(input)
  latest.current = input
  const store = useStore()
  useLayoutEffect(() => {
    const element = canvas.current!
    const style = getComputedStyle(element)
    const color = (name: string, fallback: string) =>
      style.getPropertyValue(name).trim() || fallback
    const view = createCanvasCells(element, latest.current, { store,
      viewport: { x: 0, y: 0, width: 1, height: 1 },
      theme: { background: color('--surface', '#fff'),
        foreground: color('--text', '#252b37'),
        gridline: color('--gridline', '#dce1e8'), selection: color('--primary', '#315cda') },
      onFrame: stats => {
        element.dataset.paintedCells = String(stats.cells)
        element.dataset.reusedPixels = String(stats.reusedPixels ?? 0)
      },
    })
    renderer.current = view
    viewport.current = bindCanvasViewport(element, view)
    return () => {
      viewport.current?.dispose(); viewport.current = undefined
      renderer.current = undefined; view.dispose()
    }
  }, [store])
  useLayoutEffect(() => {
    renderer.current?.update(input)
    // Position, backing-store resize and pixels must be ready in the same browser paint.
    viewport.current?.sync()
  }, [input])
  return <canvas ref={canvas} aria-label={t`Canvas worksheet cells`} role="img"
    style={{ display: 'block', touchAction: 'none' }} />
}
