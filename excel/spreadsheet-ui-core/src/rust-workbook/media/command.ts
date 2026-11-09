import type { WorkerCommand } from '../../rust-worker/types'
import type { WasmWorkbook } from '../wasm-types'

export interface WasmMediaQueries {
  put_media?: (bytes: Uint8Array) => string
  media_bytes?: (id: string) => Uint8Array
  media_type?: (id: string) => string
}

/** 工作簿媒体（图片字节）：存入得到 id，对象经 `SheetDrawing.media` 引用；不进撤销历史。 */
export interface RustMediaCommands {
  'media.put': WorkerCommand<{ readonly bytes: Uint8Array }, { readonly id: string }>
  'media.read': WorkerCommand<{ readonly id: string },
    { readonly bytes: Uint8Array; readonly mime: string }>
}

function media(workbook: WasmWorkbook) {
  if (!workbook.put_media || !workbook.media_bytes || !workbook.media_type)
    throw new Error('Rust images are unavailable.')
  return { put: workbook.put_media.bind(workbook), bytes: workbook.media_bytes.bind(workbook),
    type: workbook.media_type.bind(workbook) }
}

export function putMedia(workbook: WasmWorkbook,
  input: RustMediaCommands['media.put']['payload']): { id: string } {
  if (!(input?.bytes instanceof Uint8Array)) throw new Error('Invalid image bytes.')
  return { id: media(workbook).put(input.bytes) }
}

export function readMedia(workbook: WasmWorkbook,
  input: RustMediaCommands['media.read']['payload']): { bytes: Uint8Array; mime: string } {
  if (typeof input?.id !== 'string') throw new Error('Invalid image id.')
  const api = media(workbook)
  return { bytes: api.bytes(input.id), mime: api.type(input.id) }
}
