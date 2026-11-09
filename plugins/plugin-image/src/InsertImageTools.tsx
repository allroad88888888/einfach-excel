import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { useRef, type ChangeEvent, type FormEvent } from 'react'
import { dismissImageErrorAtom, imageUrlFormAtom, insertImageAtom, insertImageFeedbackAtom,
  reportImageErrorAtom, setImageUrlFormAtom } from './core'
import { measureBlob, measureUrl } from './image-size'
import { labels } from './messages'

/** 宿主上传：把文件存到自己的服务，返回 http(s) 地址；工作簿只存地址。 */
export type ImageUpload = (file: File) => Promise<string>

/** 「插入」分组：从文件或地址插入图片。有上传钩子时文件先上传，否则字节存进工作簿。 */
export function createInsertImageTools(upload?: ImageUpload) {
  return function InsertImageTools() {
    const { i18n } = useLingui()
    const insert = useSetAtom(insertImageAtom)
    const dismiss = useSetAtom(dismissImageErrorAtom)
    const feedback = useAtomValue(insertImageFeedbackAtom)
    const fileInput = useRef<HTMLInputElement>(null)
    const form = useAtomValue(imageUrlFormAtom)
    const setForm = useSetAtom(setImageUrlFormAtom)
    const report = useSetAtom(reportImageErrorAtom)
    const { open: urlOpen, text: url } = form
    const error = feedback.error

    const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0]
      event.currentTarget.value = ''
      if (!file) return
      dismiss()
      const size = await measureBlob(file)
      const alt = file.name.replace(/\.[^.]+$/, '')
      if (!upload) {
        await insert({ type: 'bytes', bytes: new Uint8Array(await file.arrayBuffer()), size, alt })
        return
      }
      let address: string
      try { address = await upload(file) } catch {
        report('The picture upload failed.')
        return
      }
      await insert({ type: 'url', url: address, size, alt })
    }
    const onUrl = async (event: FormEvent) => {
      event.preventDefault()
      const size = await measureUrl(url.trim())
      if (await insert({ type: 'url', url, size })) setForm({ open: false, text: '' })
    }
    return (
      <div className="plugin-image-tools" role="group" aria-label={i18n._(labels.group)}>
        <button type="button" className="tool-button" data-image-insert="file"
          aria-label={i18n._(labels.fromFile)} title={i18n._(labels.fromFile)}
          disabled={feedback.busy} onClick={() => fileInput.current?.click()}>🖼</button>
        <input ref={fileInput} type="file" hidden data-testid="plugin-image-file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/bmp"
          onChange={(event) => void onFile(event)} />
        <button type="button" className="tool-button" data-image-insert="url"
          aria-label={i18n._(labels.fromUrl)} title={i18n._(labels.fromUrl)}
          aria-expanded={urlOpen} disabled={feedback.busy}
          onClick={() => setForm({ open: !urlOpen })}>🔗</button>
        {urlOpen && (
          <form className="plugin-image-url" onSubmit={(event) => void onUrl(event)}>
            <input type="url" autoFocus aria-label={i18n._(labels.url)} value={url}
              placeholder="https://" onChange={(event) => setForm({ text: event.currentTarget.value })}
              onKeyDown={(event) => { if (event.key === 'Escape') setForm({ open: false }) }} />
            <button type="submit" disabled={feedback.busy || !url.trim()}>
              {i18n._(labels.insert)}</button>
            <button type="button" onClick={() => setForm({ open: false })}>{i18n._(labels.cancel)}</button>
          </form>
        )}
        {error && (
          <span className="plugin-image-error" role="alert">
            {i18n._({ id: error, message: error })}
            <button type="button" aria-label={i18n._(labels.close)}
              onClick={() => dismiss()}>×</button>
          </span>
        )}
      </div>
    )
  }
}
