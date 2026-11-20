import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  DEFAULT_SPLIT_RATIO,
  editingSessionAtom,
  MAX_SPLIT_RATIO,
  MIN_SPLIT_RATIO,
  runSplitWindowAtom,
  setSplitWindowRatioAtom,
  type ActiveSplitWindowState,
} from '@einfach-excel/spreadsheet-ui-core'
import { useLingui } from '@lingui/react/macro'
import type { KeyboardEvent, PointerEvent, RefObject } from 'react'

const KEYBOARD_STEP = 0.05

interface SplitDividersProps {
  readonly containerRef: RefObject<HTMLDivElement | null>
  readonly split: ActiveSplitWindowState
}

/** Draggable, keyboard-accessible split bars; double-clicking an axis removes that split. */
export function SplitDividers({ containerRef, split }: SplitDividersProps) {
  const { t } = useLingui()
  const editing = useAtomValue(editingSessionAtom).source !== null
  const setRatio = useSetAtom(setSplitWindowRatioAtom)
  const runSplit = useSetAtom(runSplitWindowAtom)
  if (split.mode === 'none') return null

  const updateFromPointer = (
    axis: 'horizontal' | 'vertical' | 'both',
    clientX: number,
    clientY: number,
  ) => {
    if (editing) return
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    if ((axis === 'horizontal' || axis === 'both') && rect.height > 0) {
      setRatio({ axis: 'horizontal', ratio: (clientY - rect.top) / rect.height })
    }
    if ((axis === 'vertical' || axis === 'both') && rect.width > 0) {
      setRatio({ axis: 'vertical', ratio: (clientX - rect.left) / rect.width })
    }
  }

  const handlePointerDown = (axis: 'horizontal' | 'vertical' | 'both') =>
    (event: PointerEvent<HTMLDivElement>) => {
      if (editing || event.button !== 0) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      updateFromPointer(axis, event.clientX, event.clientY)
    }

  const handlePointerMove = (axis: 'horizontal' | 'vertical' | 'both') =>
    (event: PointerEvent<HTMLDivElement>) => {
      if (editing || !event.currentTarget.hasPointerCapture(event.pointerId)) return
      updateFromPointer(axis, event.clientX, event.clientY)
    }

  const handleKeyDown = (axis: 'horizontal' | 'vertical') =>
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (editing) return
      const current =
        (axis === 'horizontal' ? split.horizontalRatio : split.verticalRatio) ?? DEFAULT_SPLIT_RATIO
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        setRatio({ axis, ratio: null })
        return
      }
      if (event.key === 'Home') {
        event.preventDefault()
        setRatio({ axis, ratio: MIN_SPLIT_RATIO })
        return
      }
      if (event.key === 'End') {
        event.preventDefault()
        setRatio({ axis, ratio: MAX_SPLIT_RATIO })
        return
      }
      const decrease = axis === 'horizontal' ? 'ArrowUp' : 'ArrowLeft'
      const increase = axis === 'horizontal' ? 'ArrowDown' : 'ArrowRight'
      if (event.key === decrease) {
        event.preventDefault()
        setRatio({ axis, ratio: current - KEYBOARD_STEP })
      } else if (event.key === increase) {
        event.preventDefault()
        setRatio({ axis, ratio: current + KEYBOARD_STEP })
      }
    }

  return (
    <>
      {split.horizontalRatio !== null && (
        <div
          role="separator"
          tabIndex={0}
          className="split-divider split-divider-horizontal"
          data-split-divider="horizontal"
          aria-orientation="horizontal"
          aria-label={t`Resize horizontal split`}
          aria-valuemin={Math.round(MIN_SPLIT_RATIO * 100)}
          aria-valuemax={Math.round(MAX_SPLIT_RATIO * 100)}
          aria-valuenow={Math.round(split.horizontalRatio * 100)}
          onPointerDown={handlePointerDown('horizontal')}
          onPointerMove={handlePointerMove('horizontal')}
          onDoubleClick={() => {
            if (!editing) setRatio({ axis: 'horizontal', ratio: null })
          }}
          onKeyDown={handleKeyDown('horizontal')}
        />
      )}
      {split.verticalRatio !== null && (
        <div
          role="separator"
          tabIndex={0}
          className="split-divider split-divider-vertical"
          data-split-divider="vertical"
          aria-orientation="vertical"
          aria-label={t`Resize vertical split`}
          aria-valuemin={Math.round(MIN_SPLIT_RATIO * 100)}
          aria-valuemax={Math.round(MAX_SPLIT_RATIO * 100)}
          aria-valuenow={Math.round(split.verticalRatio * 100)}
          onPointerDown={handlePointerDown('vertical')}
          onPointerMove={handlePointerMove('vertical')}
          onDoubleClick={() => {
            if (!editing) setRatio({ axis: 'vertical', ratio: null })
          }}
          onKeyDown={handleKeyDown('vertical')}
        />
      )}
      {split.mode === 'quad' && (
        <div
          className="split-divider split-divider-intersection"
          data-split-divider="intersection"
          aria-hidden="true"
          onPointerDown={handlePointerDown('both')}
          onPointerMove={handlePointerMove('both')}
          onDoubleClick={() => {
            if (!editing) void runSplit('clear')
          }}
        />
      )}
    </>
  )
}
