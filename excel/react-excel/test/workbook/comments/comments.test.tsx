import { act, fireEvent, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import type { RustCommentCommands } from '../../../../spreadsheet-ui-core/src/rust-workbook/comments/command'
import { setup, click, change, firstThread } from './fixture'

test('open displays authored local times as plain text; close restores trigger focus without writing', async () => {
  const { request, container } = setup(firstThread())
  await click('Comments')
  expect(screen.getByRole('dialog', { name: 'Cell comments' })).toBeVisible()
  expect(screen.getByLabelText('Workbook display name')).toHaveFocus()
  expect(screen.getByText('<b>Alice</b>')).toBeVisible()
  expect(screen.getByText('<img src=x> 第二行')).toBeVisible()
  expect(container.querySelector('img')).toBeNull()
  const time = container.querySelector('time')!
  expect(time.dateTime).toBe('2023-11-14T22:13:20.000Z')
  expect(time.textContent).toBe(new Intl.DateTimeFormat('en', {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(1700000000000))
  await change('Reply text', 'discard'); await click('Close comments')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Comments' })).toHaveFocus()
  expect(request).toHaveBeenCalledTimes(1)
})

test('author typing keeps focus and a retained author focuses the body on reopen', async () => {
  const { request } = setup()
  let finishRead!: (value: unknown) => void
  request.mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve }))
  await click('Comments')
  const author = screen.getByLabelText('Workbook display name')
  expect(author).toBeDisabled()
  await act(async () => { finishRead({ thread: null, revision: 1 }) })
  expect(author).toHaveFocus()
  await change('Workbook display name', 'A')
  expect(author).toHaveFocus()
  await change('Workbook display name', 'Alice')
  expect(author).toHaveFocus()
  await click('Close comments')
  expect(screen.getByRole('button', { name: 'Comments' })).toHaveFocus()
  await click('Comments')
  expect(screen.getByLabelText('Workbook display name')).toHaveValue('Alice')
  const body = screen.getByLabelText('Comment text')
  expect(body).toHaveFocus()
  await change('Comment text', 'draft')
  expect(body).toHaveFocus()
})

test('new comment reply resolve and reopen use native commands and visible history', async () => {
  const { request } = setup()
  await click('Comments'); expect(screen.getByText(/No comments yet/)).toBeVisible()
  await change('Workbook display name', 'Alice'); await change('Comment text', 'first\n第二行')
  await click('New comment')
  expect(request.mock.calls[1]).toMatchObject(['comments.change', {
    change: { action: 'create', author: 'Alice', body: 'first\n第二行' },
  }])
  expect(screen.getByLabelText('Reply text')).toHaveValue('')
  expect(screen.getByRole('list', { name: 'Comment history' }).children).toHaveLength(1)
  await change('Workbook display name', 'Bob')
  await change('Reply text', 'reply'); await click('Post reply')
  expect(screen.getByText('reply')).toBeVisible()
  await click('Resolve discussion')
  expect(screen.getByText('Resolved this discussion')).toBeVisible()
  expect(screen.getByLabelText('Reply text')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Post reply' })).toBeDisabled()
  await click('Reopen discussion')
  expect(screen.getByText('Reopened this discussion')).toBeVisible()
  expect(screen.getByLabelText('Reply text')).toBeEnabled()
  expect(screen.getByRole('list', { name: 'Comment history' }).children).toHaveLength(4)
  await click('Close comments')
})

test('invalid identity and text retain editable draft; native failure can retry', async () => {
  const { request } = setup()
  await click('Comments'); await change('Comment text', 'body'); await click('New comment')
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a workbook display name.')
  await change('Workbook display name', 'Alice')
  await change('Comment text', ' \n'); await click('New comment')
  expect(screen.getByRole('alert')).toHaveTextContent('Enter comment text.')
  await change('Comment text', 'retry')
  let fail!: (error: Error) => void
  request.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
  await click('New comment')
  expect(screen.getByLabelText('Comment text')).toBeDisabled()
  await act(async () => { fail(new Error('Native write failed.')) })
  expect(screen.getByRole('alert')).toHaveTextContent('Native write failed.')
  expect(screen.getByLabelText('Comment text')).toHaveValue('retry')
  expect(screen.getByLabelText('Comment text')).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Close comments' })).toBeEnabled()
  await click('New comment'); expect(screen.getByText('retry')).toBeVisible()
})

test('Escape discards new draft and cycles focus through the dialog', async () => {
  const { request } = setup()
  await click('Comments')
  const author = screen.getByLabelText('Workbook display name')
  await act(async () => { fireEvent.keyDown(author, { key: 'Tab', shiftKey: true }) })
  expect(screen.getByRole('button', { name: 'New comment' })).toHaveFocus()
  await act(async () => { fireEvent.keyDown(document.activeElement!, { key: 'Tab' }) })
  expect(author).toHaveFocus()
  await change('Comment text', 'discard')
  await act(async () => {
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Comments' })).toHaveFocus()
  expect(request).toHaveBeenCalledTimes(1)
})

test('deferred native reads expose cancellable loading and saving forbids duplicates or Escape', async () => {
  const { request } = setup()
  let finish!: (value: unknown) => void
  request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await click('Comments')
  expect(screen.getByText('Loading comments…')).toBeVisible()
  expect(screen.getByLabelText('Workbook display name')).toBeDisabled()
  await click('Close comments')
  await act(async () => { finish({ thread: firstThread(), revision: 1 }) })
  expect(screen.queryByRole('dialog')).toBeNull()
  await click('Comments')
  await change('Workbook display name', 'Alice'); await change('Comment text', 'pending')
  request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await click('New comment')
  expect(screen.getByText('Saving comment…')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Close comments' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'New comment' })).toBeDisabled()
  await act(async () => {
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  })
  expect(screen.getByRole('dialog')).toBeVisible()
  const input = request.mock.calls[2][1] as RustCommentCommands['comments.change']['payload']
  await act(async () => {
    finish({ changed: true, thread: { resolved: false, entries: [
      { kind: 'message', author: 'Alice', body: 'pending', createdAt: 1700000000000 },
    ] }, projection: { ...input.projection, cells: [], revision: 2 } })
  })
  expect(screen.queryByText('Saving comment…')).toBeNull()
  expect(screen.getByLabelText('Reply text')).toBeEnabled()
  expect(screen.getByLabelText('Reply text')).toHaveFocus()
  expect(request).toHaveBeenCalledTimes(3)
})
