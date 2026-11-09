import { useAtomValue, useSetAtom } from '@einfach/react'
import type { DrawingRendererProps } from '@einfach-excel/react-excel'
import { loadWorkbookMediaAtom, workbookMediaUrlsAtom } from '@einfach-excel/spreadsheet-ui-core'
import { useLingui } from '@lingui/react'
import { useEffect } from 'react'
import { brokenImagesAtom, markImageBrokenAtom, type ImagePayload } from './core'
import { labels } from './messages'

/** 图片内容：媒体库里的字节换成 Blob URL 显示，外链直接显示；拉伸填满对象框。 */
export function ImageView({ drawing }: DrawingRendererProps) {
  const { i18n } = useLingui()
  const urls = useAtomValue(workbookMediaUrlsAtom)
  const load = useSetAtom(loadWorkbookMediaAtom)
  const payload = drawing.payload as ImagePayload
  const media = drawing.media
  useEffect(() => { if (media) void load(media) }, [media, load])
  const entry = media ? urls.get(media) : undefined
  const src = media ? entry?.url : payload.src
  const broken = useAtomValue(brokenImagesAtom)
  const markBroken = useSetAtom(markImageBrokenAtom)
  if (!src || broken.has(src) || entry?.status === 'error')
    return <div className="plugin-image-missing" role="img"
      aria-label={payload.alt || i18n._(labels.missing)}>
      {entry?.status === 'loading' ? '' : i18n._(labels.missing)}</div>
  return <img className="plugin-image" src={src} alt={payload.alt ?? ''} draggable={false}
    referrerPolicy="no-referrer" onError={() => markBroken(src)} />
}
