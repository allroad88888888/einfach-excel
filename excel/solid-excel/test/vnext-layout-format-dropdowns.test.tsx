/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import { BordersDropdown } from '../src-vnext/toolbar/BordersDropdown'
import { HAlignDropdown } from '../src-vnext/toolbar/HAlignDropdown'
import { MergeDropdown } from '../src-vnext/toolbar/MergeDropdown'
import { RotationDropdown } from '../src-vnext/toolbar/RotationDropdown'
import { VAlignDropdown } from '../src-vnext/toolbar/VAlignDropdown'

afterEach(() => cleanup())

function getButton(testId: string): HTMLButtonElement {
  const button = document.body.querySelector(`[data-testid="${testId}"]`)
  expect(button).not.toBeNull()
  return button as HTMLButtonElement
}

describe('layout-format toolbar dropdown interactions', () => {
  it('focuses and exposes the current horizontal alignment', async () => {
    const onSelect = jest.fn()
    let anchor!: HTMLButtonElement
    render(() => (
      <>
        <button ref={anchor} type="button">
          Horizontal alignment
        </button>
        <HAlignDropdown
          isOpen={true}
          current="center"
          anchorRef={anchor}
          onSelect={onSelect}
          onRequestClose={() => {}}
        />
      </>
    ))

    const left = getButton('toolbar-h-align-left')
    const center = getButton('toolbar-h-align-center')
    const right = getButton('toolbar-h-align-right')
    await waitFor(() => expect(document.activeElement).toBe(center))
    expect(center.getAttribute('role')).toBe('menuitemradio')
    expect(center.getAttribute('aria-checked')).toBe('true')

    fireEvent.keyDown(center, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(right)
    fireEvent.keyDown(right, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(left)
    fireEvent.keyDown(left, { key: 'End' })
    expect(document.activeElement).toBe(right)

    fireEvent.click(right)
    expect(onSelect).toHaveBeenCalledWith('right')
    expect(document.activeElement).toBe(anchor)
  })

  it('navigates vertical alignment and restores focus on Escape', async () => {
    const onClose = jest.fn()
    let anchor!: HTMLButtonElement
    render(() => (
      <>
        <button ref={anchor} type="button">
          Vertical alignment
        </button>
        <VAlignDropdown
          isOpen={true}
          current="bottom"
          anchorRef={anchor}
          onSelect={() => {}}
          onRequestClose={onClose}
        />
      </>
    ))

    const top = getButton('toolbar-v-align-top')
    const bottom = getButton('toolbar-v-align-bottom')
    await waitFor(() => expect(document.activeElement).toBe(bottom))
    expect(bottom.getAttribute('aria-checked')).toBe('true')

    fireEvent.keyDown(bottom, { key: 'Home' })
    expect(document.activeElement).toBe(top)
    fireEvent.keyDown(top, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(bottom)
    fireEvent.keyDown(bottom, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(anchor)
  })

  it('skips a disabled inner-border command during keyboard navigation', async () => {
    const onSelect = jest.fn()
    let anchor!: HTMLButtonElement
    render(() => (
      <>
        <button ref={anchor} type="button">
          Borders
        </button>
        <BordersDropdown
          isOpen={true}
          isMultiCell={false}
          anchorRef={anchor}
          onSelect={onSelect}
          onRequestClose={() => {}}
        />
      </>
    ))

    const all = getButton('toolbar-borders-all')
    const outer = getButton('toolbar-borders-outer')
    const inner = getButton('toolbar-borders-inner')
    const top = getButton('toolbar-borders-top')
    await waitFor(() => expect(document.activeElement).toBe(all))
    expect(inner.disabled).toBe(true)

    fireEvent.keyDown(all, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(outer)
    fireEvent.keyDown(outer, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(top)
    fireEvent.click(top)
    expect(onSelect).toHaveBeenCalledWith('top')
    expect(document.activeElement).toBe(anchor)
  })

  it('focuses the only available merge recovery command', async () => {
    const onSelect = jest.fn()
    let anchor!: HTMLButtonElement
    render(() => (
      <>
        <button ref={anchor} type="button">
          Merge
        </button>
        <MergeDropdown
          isOpen={true}
          isMultiCell={false}
          canUnmerge={true}
          anchorRef={anchor}
          onSelect={onSelect}
          onRequestClose={() => {}}
        />
      </>
    ))

    const merge = getButton('toolbar-merge-center')
    const unmerge = getButton('toolbar-merge-unmerge')
    await waitFor(() => expect(document.activeElement).toBe(unmerge))
    expect(merge.disabled).toBe(true)
    expect(unmerge.disabled).toBe(false)

    fireEvent.click(unmerge)
    expect(onSelect).toHaveBeenCalledWith('unmerge')
    expect(document.activeElement).toBe(anchor)
  })

  it('gives rotation a roving menu focus lifecycle', async () => {
    const onSelect = jest.fn()
    const onClose = jest.fn()
    let anchor!: HTMLButtonElement
    render(() => (
      <>
        <button ref={anchor} type="button">
          Rotation
        </button>
        <RotationDropdown
          isOpen={true}
          anchorRef={anchor}
          onSelect={onSelect}
          onRequestClose={onClose}
        />
      </>
    ))

    const zero = getButton('toolbar-rotation-0')
    const fortyFive = getButton('toolbar-rotation-45')
    await waitFor(() => expect(document.activeElement).toBe(zero))

    fireEvent.keyDown(zero, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(fortyFive)
    fireEvent.click(fortyFive)
    expect(onSelect).toHaveBeenCalledWith(45)
    expect(document.activeElement).toBe(anchor)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(anchor)
  })
})
