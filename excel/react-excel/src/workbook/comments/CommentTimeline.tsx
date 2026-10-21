import { useLingui, Trans } from '@lingui/react/macro'
import type { NativeCommentThread } from '@einfach/spreadsheet-ui-core'

/** React 文本节点保留原文；从不把作者或正文解释成 HTML。 */
export function CommentTimeline({
  thread,
}: {
  thread: NativeCommentThread | null
}): React.JSX.Element {
  const { t, i18n } = useLingui()
  if (!thread)
    return (
      <p className="comment-empty">
        <Trans>No comments yet. Start a discussion about this cell.</Trans>
      </p>
    )
  return (
    <>
      <p className="comment-state" role="status">
        {thread.resolved ? <Trans>Resolved</Trans> : <Trans>Open discussion</Trans>}
      </p>
      <ol className="comment-timeline" aria-label={t`Comment history`}>
        {thread.entries.map((entry, index) => (
          <li key={index} className={`comment-entry comment-entry-${entry.kind}`}>
            <div className="comment-byline">
              <strong>{entry.author}</strong>
              <time dateTime={new Date(entry.createdAt).toISOString()}>
                {new Intl.DateTimeFormat(i18n.locale, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(entry.createdAt)}
              </time>
            </div>
            {entry.kind === 'message' ? (
              <p className="comment-body">{entry.body}</p>
            ) : (
              <p>
                {entry.kind === 'resolve' ? (
                  <Trans>Resolved this discussion</Trans>
                ) : (
                  <Trans>Reopened this discussion</Trans>
                )}
              </p>
            )}
          </li>
        ))}
      </ol>
    </>
  )
}
