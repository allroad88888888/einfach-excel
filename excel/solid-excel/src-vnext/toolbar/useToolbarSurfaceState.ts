import { createEffect, createSignal, type Accessor } from 'solid-js'
import {
  closeToolbarSurfaceAtom,
  openToolbarDropdownAtom,
  openToolbarPaletteAtom,
  type ToolbarDropdownKind,
  type ToolbarActiveSurface,
} from '@einfach/spreadsheet-ui-core'
import type { useSpreadsheetUiStore } from '../provider'
import type { HAlignValue } from './HAlignDropdown'
import type { VAlignValue } from './VAlignDropdown'
import type { ColorPopoverMode } from './FillColorPopover'

interface ToolbarSurfaceStateProps {
  activeCellFormat: () => { align?: string; verticalAlign?: string }
  activeToolbarSurface: Accessor<ToolbarActiveSurface | null>
  store: ReturnType<typeof useSpreadsheetUiStore>
}

/** Holds only DOM anchors and Core-owned toolbar-surface selection. */
export function useToolbarSurfaceState(props: ToolbarSurfaceStateProps) {
  let bordersAnchorRef: HTMLButtonElement | undefined
  let hAlignAnchorRef: HTMLButtonElement | undefined
  let vAlignAnchorRef: HTMLButtonElement | undefined
  let mergeAnchorRef: HTMLButtonElement | undefined
  let rotationAnchorRef: HTMLButtonElement | undefined
  let sortAnchorRef: HTMLButtonElement | undefined
  let numberFormatAnchorEl: HTMLButtonElement | null = null
  let fontFamilyAnchorEl: HTMLButtonElement | null = null
  let fontSizeAnchorEl: HTMLButtonElement | null = null
  const colorAnchors: Partial<Record<ColorPopoverMode, HTMLButtonElement>> = {}
  const [anchorRect, setAnchorRect] = createSignal<DOMRect | null>(null)
  const [numberFormatAnchor, setNumberFormatAnchor] = createSignal<DOMRect | null>(null)
  const [fontFamilyAnchor, setFontFamilyAnchor] = createSignal<DOMRect | null>(null)
  const [fontSizeAnchor, setFontSizeAnchor] = createSignal<DOMRect | null>(null)

  function isDropdownOpen(dropdown: ToolbarDropdownKind) {
    const surface = props.activeToolbarSurface()
    return surface?.kind === 'dropdown' && surface.id === dropdown
  }
  function closeSurface() {
    props.store.setter(closeToolbarSurfaceAtom)
  }
  function toggleToolbarDropdown(dropdown: ToolbarDropdownKind) {
    if (isDropdownOpen(dropdown)) closeSurface()
    else props.store.setter(openToolbarDropdownAtom, { dropdown })
  }
  function activeColorMode(): ColorPopoverMode | null {
    const surface = props.activeToolbarSurface()
    return surface?.kind === 'palette' ? (surface.id === 'fill-color' ? 'fill' : 'text') : null
  }
  function toggleColorPopover(mode: ColorPopoverMode) {
    const palette = mode === 'fill' ? 'fill-color' : 'text-color'
    const current = props.activeToolbarSurface()
    if (current?.kind === 'palette' && current.id === palette) {
      closeSurface()
      setAnchorRect(null)
      return
    }
    setAnchorRect(colorAnchors[mode]?.getBoundingClientRect() ?? null)
    props.store.setter(openToolbarPaletteAtom, { palette })
  }
  createEffect(() => {
    if (activeColorMode() === null) setAnchorRect(null)
  })

  function currentHAlign(): HAlignValue {
    const align = props.activeCellFormat().align
    return align === 'center' || align === 'right' ? align : 'left'
  }
  function currentVAlign(): VAlignValue {
    const align = props.activeCellFormat().verticalAlign
    return align === 'top' || align === 'center' ? align : 'bottom'
  }
  function openAnchoredDropdown(
    kind: 'number-format' | 'font-family' | 'font-size',
    button: HTMLButtonElement,
  ) {
    if (kind === 'number-format') {
      numberFormatAnchorEl = button
      setNumberFormatAnchor(button.getBoundingClientRect())
    }
    if (kind === 'font-family') {
      fontFamilyAnchorEl = button
      setFontFamilyAnchor(button.getBoundingClientRect())
    }
    if (kind === 'font-size') {
      fontSizeAnchorEl = button
      setFontSizeAnchor(button.getBoundingClientRect())
    }
    props.store.setter(openToolbarDropdownAtom, { dropdown: kind })
  }
  function closeAnchoredDropdown(kind: 'number-format' | 'font-family' | 'font-size') {
    closeSurface()
    if (kind === 'number-format') setNumberFormatAnchor(null)
    if (kind === 'font-family') setFontFamilyAnchor(null)
    if (kind === 'font-size') setFontSizeAnchor(null)
  }

  return {
    activeColorMode,
    anchorRect,
    bordersAnchorRef: () => bordersAnchorRef,
    closeAnchoredDropdown,
    closeSurface,
    colorAnchors,
    currentHAlign,
    currentVAlign,
    fontFamilyAnchor,
    fontFamilyAnchorEl: () => fontFamilyAnchorEl,
    fontSizeAnchor,
    fontSizeAnchorEl: () => fontSizeAnchorEl,
    isDropdownOpen,
    mergeAnchorRef: () => mergeAnchorRef,
    numberFormatAnchor,
    numberFormatAnchorEl: () => numberFormatAnchorEl,
    openAnchoredDropdown,
    rotationAnchorRef: () => rotationAnchorRef,
    setBordersAnchorRef: (el: HTMLButtonElement) => {
      bordersAnchorRef = el
    },
    setFontFamilyAnchorEl: (el: HTMLButtonElement) => {
      fontFamilyAnchorEl = el
    },
    setFontSizeAnchorEl: (el: HTMLButtonElement) => {
      fontSizeAnchorEl = el
    },
    hAlignAnchorRef: () => hAlignAnchorRef,
    setHAlignAnchorRef: (el: HTMLButtonElement) => {
      hAlignAnchorRef = el
    },
    setMergeAnchorRef: (el: HTMLButtonElement) => {
      mergeAnchorRef = el
    },
    setNumberFormatAnchorEl: (el: HTMLButtonElement) => {
      numberFormatAnchorEl = el
    },
    setRotationAnchorRef: (el: HTMLButtonElement) => {
      rotationAnchorRef = el
    },
    setSortAnchorRef: (el: HTMLButtonElement) => {
      sortAnchorRef = el
    },
    setVAlignAnchorRef: (el: HTMLButtonElement) => {
      vAlignAnchorRef = el
    },
    sortAnchorRef: () => sortAnchorRef,
    toggleColorPopover,
    toggleToolbarDropdown,
    vAlignAnchorRef: () => vAlignAnchorRef,
  }
}
