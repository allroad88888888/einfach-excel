import { createStore } from '@einfach/core'
import { selectWorkbookRibbonTabAtom, workbookRibbonOverflowAtom } from '@einfach-excel/spreadsheet-ui-core'
import { useAtomValue } from '@einfach/react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { msg } from '@lingui/core/macro'
import { useRef } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { RibbonGroup } from '../../../src/workbook/chrome/ribbon/RibbonGroup'
import { RibbonMore } from '../../../src/workbook/chrome/ribbon/RibbonMore'
import type { WorkbookRibbonGroup } from '../../../src/workbook/chrome/ribbon/ribbon-groups'
import { useRibbonMorePanel } from '../../../src/workbook/chrome/ribbon/use-ribbon-more-panel'
import { useRibbonOverflow } from '../../../src/workbook/chrome/ribbon/use-ribbon-overflow'

// jsdom 不排版：每组 100px，工具栏宽度由 toolsWidth 决定；“更多”预留 64px。
let toolsWidth = 1000
let alertText = ''
beforeEach(() => {
  toolsWidth = 1000
  alertText = ''
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset.ribbonGroup ? 100 : 0
  })
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) {
    return this.classList.contains('ribbon-tools') ? toolsWidth : 0
  })
})
afterEach(() => vi.restoreAllMocks())

const tool = (label: string) =>
  function Tool() {
    return (
      <>
        <button type="button" data-ribbon-item={label}>{label}</button>
        <select aria-label={`${label} choice`} defaultValue="a">
          <option value="a">A</option>
          <option value="b">B</option>
        </select>
        <select
          aria-label={`${label} command`}
          defaultValue=""
          onChange={(event) => { event.currentTarget.value = '' }}
        >
          <option value="" disabled>Choose action</option>
          <option value="run">Run action</option>
        </select>
        <span role="alert">{label === 'Tool c' ? alertText : ''}</span>
      </>
    )
  }
const GROUPS: readonly WorkbookRibbonGroup[] = ['a', 'b', 'c'].map((id) => ({
  id,
  tab: 'Start',
  title: msg`Group ${id}`,
  layout: 'stack',
  Content: tool(`Tool ${id}`),
}))

function Harness() {
  const { collapsed } = useAtomValue(workbookRibbonOverflowAtom)
  const folded = collapsed > 0 ? GROUPS.slice(GROUPS.length - collapsed) : []
  const panelRef = useRef<HTMLDivElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)
  useRibbonOverflow(toolsRef, GROUPS.map((group) => group.id))
  useRibbonMorePanel(panelRef)
  return (
    <div className="einfach-spreadsheet">
      <div ref={panelRef}>
        <div ref={toolsRef} className="ribbon-tools">
          <div className="ribbon-tool-group" data-ribbon-group="history" />
          {GROUPS.filter((group) => !folded.includes(group)).map((group) => (
            <RibbonGroup key={group.id} group={group} inactive={false} />
          ))}
          <RibbonMore groups={folded} />
        </div>
      </div>
      <button type="button">Outside</button>
    </div>
  )
}

function setup() {
  const store = createStore()
  render(
    <WorkbookStoreProvider store={store}>
      <Harness />
    </WorkbookStoreProvider>,
  )
  return store
}

const more = () => screen.getByRole('button', { name: /tools$/ })
const groupOf = (label: string) =>
  screen.getByRole('button', { name: label }).closest('[data-ribbon-group]')

test('groups that fit leave no More button', () => {
  toolsWidth = 400
  setup()
  expect(screen.queryByRole('button', { name: /tools$/ })).toBeNull()
  expect(groupOf('Tool c')).toHaveAttribute('data-inactive', 'false')
})

test('trailing groups fold whole into More and show as titled sections when expanded', () => {
  // history 100 + 更多 64 + a 100 = 264；放不下 b、c。
  toolsWidth = 300
  setup()
  expect(more()).toHaveAttribute('aria-label', 'More tools')
  expect(more()).toHaveAttribute('aria-expanded', 'false')
  expect(groupOf('Tool a')?.closest('.ribbon-more')).toBeNull()
  expect(groupOf('Tool b')).toHaveAttribute('data-inactive', 'true')
  expect(groupOf('Tool c')).toHaveAttribute('data-inactive', 'true')

  fireEvent.click(more())
  expect(more()).toHaveAttribute('aria-label', 'Fewer tools')
  expect(more()).toHaveAttribute('aria-expanded', 'true')
  expect(groupOf('Tool b')).toHaveAttribute('data-inactive', 'false')
  expect(screen.getAllByRole('region')).toHaveLength(2)
  expect(screen.getByRole('region', { name: 'Group b' })).toContainElement(
    screen.getByRole('button', { name: 'Tool b' }),
  )
  expect(document.getElementById(more().getAttribute('aria-controls')!)).toContainElement(
    screen.getByRole('button', { name: 'Tool c' }),
  )
})

test('Escape inside the panel collapses it and returns focus to More', () => {
  toolsWidth = 300
  setup()
  fireEvent.click(more())
  const folded = screen.getByRole('button', { name: 'Tool c' })
  folded.focus()
  fireEvent.keyDown(folded, { key: 'Escape' })
  expect(more()).toHaveAttribute('aria-expanded', 'false')
  expect(more()).toHaveFocus()
})

test('clicking inside keeps the panel open; pointerdown outside collapses it', () => {
  toolsWidth = 300
  setup()
  fireEvent.click(more())
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Tool b' }))
  expect(more()).toHaveAttribute('aria-expanded', 'true')
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }))
  expect(more()).toHaveAttribute('aria-expanded', 'false')
})

test('switching category collapses the panel', async () => {
  toolsWidth = 300
  const store = setup()
  fireEvent.click(more())
  await act(async () => {
    store.setter(selectWorkbookRibbonTabAtom, 'Data')
  })
  expect(more()).toHaveAttribute('aria-expanded', 'false')
})

test('running a folded command collapses the panel on the next frame', async () => {
  toolsWidth = 300
  setup()
  fireEvent.click(more())
  fireEvent.click(screen.getByRole('button', { name: 'Tool b' }))
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  expect(more()).toHaveAttribute('aria-expanded', 'false')
})

test('a new error in a folded group expands the panel once', async () => {
  toolsWidth = 300
  alertText = 'Check the cell before retrying'
  setup()
  await act(async () => {})
  expect(more()).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(more())
  await act(async () => {})
  expect(more()).toHaveAttribute('aria-expanded', 'false')
})

test('changing a folded select keeps its keyboard focus for further adjustments', async () => {
  toolsWidth = 300
  setup()
  fireEvent.click(more())
  const select = screen.getByRole('combobox', { name: 'Tool b choice' })
  select.focus()
  fireEvent.change(select, { target: { value: 'b' } })
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  expect(more()).toHaveAttribute('aria-expanded', 'true')
  expect(select).toHaveFocus()
})

test('a folded command menu returns to its placeholder and collapses More', async () => {
  toolsWidth = 300
  setup()
  fireEvent.click(more())
  const select = screen.getByRole('combobox', { name: 'Tool b command' })
  select.focus()
  fireEvent.change(select, { target: { value: 'run' } })
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  expect(more()).toHaveAttribute('aria-expanded', 'false')
  expect(more()).toHaveFocus()
})

test('opening a dialog outside the ribbon keeps its opener available', async () => {
  toolsWidth = 300
  setup()
  fireEvent.click(more())
  const dialog = document.createElement('dialog')
  dialog.setAttribute('open', '')
  document.querySelector('.einfach-spreadsheet')!.append(dialog)
  fireEvent.click(screen.getByRole('button', { name: 'Tool b' }))
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  expect(more()).toHaveAttribute('aria-expanded', 'true')
})

test('an asynchronous dialog trigger keeps More open before the dialog is mounted', async () => {
  toolsWidth = 300
  setup()
  fireEvent.click(more())
  const trigger = screen.getByRole('button', { name: 'Tool b' })
  trigger.setAttribute('aria-haspopup', 'dialog')
  fireEvent.click(trigger)
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  expect(more()).toHaveAttribute('aria-expanded', 'true')
})

test('a native confirmation arriving after the menu closed exposes its original control', async () => {
  toolsWidth = 300
  setup()
  fireEvent.click(more())
  fireEvent.click(screen.getByRole('button', { name: 'Tool b' }))
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  expect(more()).toHaveAttribute('aria-expanded', 'false')
  const dialog = document.createElement('dialog')
  await act(async () => { groupOf('Tool b')!.append(dialog) })
  expect(more()).toHaveAttribute('aria-expanded', 'false')
  await act(async () => { dialog.setAttribute('open', '') })
  expect(more()).toHaveAttribute('aria-expanded', 'true')
  expect(groupOf('Tool b')).toHaveAttribute('data-inactive', 'false')
})

test('moving focus out of More closes it without stealing the destination focus', () => {
  toolsWidth = 300
  setup()
  fireEvent.click(more())
  screen.getByRole('button', { name: 'Tool b' }).focus()
  fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true })
  const inline = screen.getByRole('button', { name: 'Tool a' })
  act(() => inline.focus())
  expect(more()).toHaveAttribute('aria-expanded', 'false')
  expect(inline).toHaveFocus()
})

test('moving focus to an external popup keeps the folded opener available', () => {
  toolsWidth = 300
  setup()
  fireEvent.click(more())
  screen.getByRole('button', { name: 'Tool b' }).focus()
  fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
  const dialog = document.createElement('div')
  dialog.setAttribute('role', 'dialog')
  const input = document.createElement('input')
  dialog.append(input)
  document.querySelector('.einfach-spreadsheet')!.append(dialog)
  act(() => input.focus())
  expect(more()).toHaveAttribute('aria-expanded', 'true')
  expect(input).toHaveFocus()
})
