/** 工作簿内纯文本作者只是显示名，不能证明身份或权限。 */
export const COMMENT_BODY_MAX = 32767
export const COMMENT_AUTHOR_MAX = 100
export interface NativeCommentEntry {
  readonly kind: 'message' | 'resolve' | 'reopen'
  readonly author: string
  readonly body?: string
  readonly createdAt: number
}
export interface NativeCommentThread {
  readonly entries: readonly NativeCommentEntry[]
  readonly resolved: boolean
}
export type NativeCommentChange =
  | { readonly action: 'create' | 'reply'; readonly author: string; readonly body: string }
  | { readonly action: 'resolve' | 'reopen'; readonly author: string }

export function normalizeCommentAuthor(author: string): string {
  return author.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, '')
}

export function validateCommentDraft(author: string, body?: string): string {
  const name = normalizeCommentAuthor(author)
  if (!name) return 'Enter a workbook display name.'
  if (Array.from(name).length > COMMENT_AUTHOR_MAX) return 'Display name cannot exceed 100 characters.'
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(name)) return 'Display name cannot contain control characters.'
  if (body !== undefined) {
    if (!body.replace(/\p{White_Space}/gu, '')) return 'Enter comment text.'
    if (body.includes('\0')) return 'Comment text cannot contain a null character.'
    if (Array.from(body).length > COMMENT_BODY_MAX) return 'Comment text cannot exceed 32767 characters.'
  }
  return ''
}

/** 拒绝损坏响应；UI 不把任意 JSON 当作成功的原生线程。 */
export function isNativeCommentThread(value: unknown): value is NativeCommentThread {
  if (!value || typeof value !== 'object') return false
  const thread = value as NativeCommentThread
  if (typeof thread.resolved !== 'boolean' || !Array.isArray(thread.entries) ||
    thread.entries.length === 0 || thread.entries.length > 1000) return false
  let resolved = false
  let previous = 0
  for (const [index, entry] of thread.entries.entries()) {
    if (
      !entry ||
      typeof entry.author !== 'string' ||
      validateCommentDraft(entry.author) ||
      entry.author !== normalizeCommentAuthor(entry.author) ||
      !Number.isSafeInteger(entry.createdAt) ||
      entry.createdAt < previous ||
      entry.createdAt > 8_640_000_000_000_000
    )
      return false
    previous = entry.createdAt
    if (entry.kind === 'message' && !resolved) {
      if (typeof entry.body !== 'string' || validateCommentDraft(entry.author, entry.body) || entry.body.includes('\r')) return false
    } else if (entry.kind === 'resolve' && index > 0 && !resolved && entry.body === undefined) resolved = true
    else if (entry.kind === 'reopen' && index > 0 && resolved && entry.body === undefined) resolved = false
    else return false
  }
  return resolved === thread.resolved
}
