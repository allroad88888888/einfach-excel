import { createEffect, onCleanup, type Accessor } from 'solid-js'
import type { CommentSessionState } from '@einfach/spreadsheet-ui-core'
import { useOverlayInteraction } from '../overlay'
import { findCommentCellAnchor, positionCommentThread } from './comment-thread-dom'

export interface CommentThreadInteraction {
  readonly rootRef: (element: HTMLDivElement) => void
  readonly textareaRef: (element: HTMLTextAreaElement) => void
}

/** Owns only DOM refs, focus mechanics, and transient viewport measurement. */
export function useCommentThreadInteraction(
  session: Accessor<Readonly<CommentSessionState> | null>,
  onClose: () => void,
): CommentThreadInteraction {
  let root: HTMLDivElement | undefined
  let textarea: HTMLTextAreaElement | undefined
  const anchor = () => findCommentCellAnchor(session())
  const overlay = useOverlayInteraction({
    active: () => session() !== null,
    anchor,
    initialFocus: () => textarea,
    onRequestClose: onClose,
  })

  createEffect(() => {
    const activeSession = session()
    if (activeSession === null) return
    let disposed = false
    const update = () => {
      if (!disposed && root?.isConnected) positionCommentThread(root, anchor())
    }
    queueMicrotask(update)
    window.addEventListener('resize', update)
    document.addEventListener('scroll', update, true)
    onCleanup(() => {
      disposed = true
      window.removeEventListener('resize', update)
      document.removeEventListener('scroll', update, true)
    })
  })

  return {
    rootRef: (element) => {
      root = element
      overlay.overlayRef(element)
    },
    textareaRef: (element) => {
      textarea = element
    },
  }
}
