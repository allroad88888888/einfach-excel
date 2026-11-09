import { atom } from '@einfach/core'
import {
  activeCellAtom, activeWorkbookSheetAtom, changeSheetDrawingAtom, drawingErrorAtom,
  editingSessionAtom, putWorkbookMediaAtom, selectDrawingAtom, sheetDrawingsAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { buildImageDrawing, MAX_IMAGE_BYTES, nextImageId, validImageUrl,
  type ImageSize } from './image-drawing'

const errorAtom = atom<string | null>(null)
errorAtom.debugLabel = 'plugin.image.insert.error.state'
const busyAtom = atom(false)
busyAtom.debugLabel = 'plugin.image.insert.busy.state'
export const insertImageFeedbackAtom = atom((get) =>
  ({ error: get(errorAtom), busy: get(busyAtom) }))
insertImageFeedbackAtom.debugLabel = 'plugin.image.insert.feedback'
export const dismissImageErrorAtom = atom(null, (_get, set) => set(errorAtom, null))
/** 宿主上传失败等界面侧错误也显示在插入按钮旁。 */
export const reportImageErrorAtom = atom(null, (_get, set, error: string) => set(errorAtom, error))
reportImageErrorAtom.debugLabel = 'plugin.image.insert.report'
dismissImageErrorAtom.debugLabel = 'plugin.image.insert.dismiss'

/** 本地文件：字节已读出；宿主上传后得到的地址走 `url`。尺寸由界面解码得到。 */
export type ImageSource =
  | { readonly type: 'bytes'; readonly bytes: Uint8Array; readonly size: ImageSize | null;
    readonly alt?: string }
  | { readonly type: 'url'; readonly url: string; readonly size: ImageSize | null;
    readonly alt?: string }

/** 插入一张图片：字节先存进工作簿媒体库，再一次对象命令、一条撤销记录，插入后选中。 */
export const insertImageAtom = atom(null, async (get, set, source: ImageSource) => {
  if (get(busyAtom) || get(editingSessionAtom).source) return false
  const sheet = get(activeWorkbookSheetAtom)
  if (!sheet) return false
  const fail = (error: string) => { set(errorAtom, error); return false }
  let src: string | undefined
  if (source.type === 'url') {
    src = validImageUrl(source.url) ?? undefined
    if (!src) return fail('Enter an http or https image address.')
  } else if (source.bytes.byteLength > MAX_IMAGE_BYTES) {
    return fail('An image cannot exceed 10 MiB.')
  }
  set(busyAtom, true)
  set(errorAtom, null)
  try {
    let media: string | undefined
    if (source.type === 'bytes') {
      const stored = await set(putWorkbookMediaAtom, source.bytes)
      if (!stored.ok) return fail(stored.error)
      media = stored.id
    }
    if (get(activeWorkbookSheetAtom)?.id !== sheet.id) return false
    const cell = get(activeCellAtom)
    const id = nextImageId(get(sheetDrawingsAtom))
    const drawing = buildImageDrawing({ id, row: cell.row, col: cell.col, size: source.size,
      media, src, alt: source.alt })
    const changed = await set(changeSheetDrawingAtom, { type: 'set', drawing })
    if (changed) set(selectDrawingAtom, id)
    else set(errorAtom, get(drawingErrorAtom))
    return changed
  } finally {
    set(busyAtom, false)
  }
})
insertImageAtom.debugLabel = 'plugin.image.insert'
