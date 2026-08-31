import { For, Show } from 'solid-js'
import {
  FILL_HANDLE_SIZE,
  OVERLAY_BORDER_WIDTH,
  OVERLAY_COLORS,
  type OverlayRect,
} from './overlay-types'
import type { OverlaySvgGeometry } from './overlay-svg-geometry'

export interface OverlaySvgLayersProps {
  geometry: OverlaySvgGeometry
}

const FORMULA_REF_STROKE_WIDTH = 1.5
const FORMULA_REF_INSET_HALF = 0.5
const CF_OPACITY = 0.35

export function OverlaySvgLayers(props: OverlaySvgLayersProps) {
  const { geometry } = props
  return (
    <>
      <For each={geometry.conditionalFormatRects()}>
        {(rect) => (
          <rect
            data-testid="svg-overlay-cf-bg"
            {...rectAttributes(rect)}
            fill={rect.color}
            fill-opacity={CF_OPACITY}
            stroke="none"
          />
        )}
      </For>
      <For each={geometry.mergeBorderRects()}>
        {(rect) => (
          <BorderRect
            testId="svg-overlay-merge-border"
            rect={rect}
            color={OVERLAY_COLORS.mergeBorder}
            width={OVERLAY_BORDER_WIDTH.merge}
          />
        )}
      </For>
      <Show when={geometry.spillBorderRect()}>
        {(rect) => (
          <BorderRect
            testId="svg-overlay-spill-border"
            rect={rect()}
            color={OVERLAY_COLORS.spillBorder}
            width={OVERLAY_BORDER_WIDTH.spill}
          />
        )}
      </Show>
      <For each={geometry.secondarySelectionRects()}>
        {(rect) => (
          <SelectionLayer
            prefix="secondary-selection"
            rect={rect}
            fill={OVERLAY_COLORS.secondarySelectionFill}
            border={OVERLAY_COLORS.secondarySelectionBorder}
            width={OVERLAY_BORDER_WIDTH.secondary}
          />
        )}
      </For>
      <Show when={geometry.primarySelection()} keyed>
        {(rect) => (
          <SelectionLayer
            prefix="primary-selection"
            rect={rect}
            fill={OVERLAY_COLORS.primarySelectionFill}
            border={OVERLAY_COLORS.primarySelectionBorder}
            width={OVERLAY_BORDER_WIDTH.primary}
          />
        )}
      </Show>
      <Show when={geometry.activeCellRect()} keyed>
        {(rect) => (
          <BorderRect
            testId="svg-overlay-active-cell"
            rect={rect}
            color={OVERLAY_COLORS.activeCellBorder}
            width={OVERLAY_BORDER_WIDTH.active}
          />
        )}
      </Show>
      <Show when={geometry.primarySelection()} keyed>
        {(rect) => (
          <rect
            data-testid="svg-overlay-fill-handle"
            x={rect.x + rect.w - FILL_HANDLE_SIZE}
            y={rect.y + rect.h - FILL_HANDLE_SIZE}
            width={FILL_HANDLE_SIZE}
            height={FILL_HANDLE_SIZE}
            fill={OVERLAY_COLORS.fillHandle}
            stroke={OVERLAY_COLORS.fillHandleStroke}
            stroke-width={1}
          />
        )}
      </Show>
      <Show when={geometry.fillPreviewRect()} keyed>
        {(rect) => (
          <BorderRect
            testId="svg-overlay-fill-preview"
            rect={rect}
            color={OVERLAY_COLORS.dropIndicator}
            width={OVERLAY_BORDER_WIDTH.drop}
            dash="4 3"
          />
        )}
      </Show>
      <Show when={geometry.clipboardSourceRect()} keyed>
        {(rect) => <MarchingAnts rect={rect} />}
      </Show>
      <For each={geometry.formulaReferenceRects()}>
        {(rect) => (
          <rect
            data-testid={rect.testId}
            x={rect.x + FORMULA_REF_INSET_HALF}
            y={rect.y + FORMULA_REF_INSET_HALF}
            width={Math.max(0, rect.w - 1)}
            height={Math.max(0, rect.h - 1)}
            fill="none"
            stroke={rect.color}
            stroke-width={FORMULA_REF_STROKE_WIDTH}
            stroke-dasharray="4 2"
          />
        )}
      </For>
    </>
  )
}

function SelectionLayer(props: {
  prefix: string
  rect: OverlayRect
  fill: string
  border: string
  width: number
}) {
  return (
    <>
      <rect
        data-testid={`svg-overlay-${props.prefix}-fill`}
        {...rectAttributes(props.rect)}
        fill={props.fill}
        stroke="none"
      />
      <BorderRect
        testId={`svg-overlay-${props.prefix}-border`}
        rect={props.rect}
        color={props.border}
        width={props.width}
      />
    </>
  )
}
function BorderRect(props: {
  testId: string
  rect: OverlayRect
  color: string
  width: number
  dash?: string
}) {
  return (
    <rect
      data-testid={props.testId}
      x={props.rect.x + props.width / 2}
      y={props.rect.y + props.width / 2}
      width={Math.max(0, props.rect.w - props.width)}
      height={Math.max(0, props.rect.h - props.width)}
      fill="none"
      stroke={props.color}
      stroke-width={props.width}
      stroke-dasharray={props.dash}
    />
  )
}
function MarchingAnts(props: { rect: OverlayRect }) {
  return (
    <>
      <rect
        data-testid="svg-overlay-marching-ants-halo"
        {...rectAttributes(props.rect)}
        fill="none"
        stroke={OVERLAY_COLORS.marchingAntsBg}
        stroke-width={OVERLAY_BORDER_WIDTH.marchingAnts + 1}
      />
      <rect
        class="svg-marching-ants-dash"
        data-testid="svg-overlay-marching-ants-dash"
        {...rectAttributes(props.rect)}
        fill="none"
        stroke={OVERLAY_COLORS.marchingAnts}
        stroke-width={OVERLAY_BORDER_WIDTH.marchingAnts}
        stroke-dasharray="4 3"
      />
    </>
  )
}
function rectAttributes(rect: OverlayRect) {
  return { x: rect.x, y: rect.y, width: rect.w, height: rect.h }
}
