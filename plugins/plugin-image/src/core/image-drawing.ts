import type { SheetDrawing } from '@einfach-excel/spreadsheet-ui-core'

export const IMAGE_KIND = 'image'
/** 新插入图片的最长边；原图更小时按原尺寸。 */
export const MAX_INSERT_SIZE = 480
const MIN_SIZE = 16
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/** 图片对象载荷：字节在工作簿媒体库（`drawing.media`）时 `src` 为空；外链图片只存地址。 */
export interface ImagePayload {
  readonly src?: string
  readonly alt?: string
}

export interface ImageSize {
  readonly width: number
  readonly height: number
}

/** 等比缩到最长边不超过 MAX_INSERT_SIZE；量不出尺寸时用 320×240。 */
export function fitImageSize(size: ImageSize | null): ImageSize {
  if (!size || !(size.width > 0) || !(size.height > 0)) return { width: 320, height: 240 }
  const scale = Math.min(1, MAX_INSERT_SIZE / Math.max(size.width, size.height))
  return { width: Math.max(MIN_SIZE, Math.round(size.width * scale)),
    height: Math.max(MIN_SIZE, Math.round(size.height * scale)) }
}

/** 本表内唯一：image-1、image-2…。 */
export function nextImageId(drawings: readonly SheetDrawing[]): string {
  const used = new Set(drawings.map((drawing) => drawing.id))
  let index = drawings.length + 1
  while (used.has(`image-${index}`)) index += 1
  return `image-${index}`
}

/** 只接受 http(s) 外链；data:、javascript: 等一律拒绝（本地图片走媒体库）。 */
export function validImageUrl(text: string): string | null {
  try {
    const url = new URL(text.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

export interface ImageDrawingInput {
  readonly id: string
  readonly row: number
  readonly col: number
  readonly size: ImageSize | null
  readonly media?: string
  readonly src?: string
  readonly alt?: string
}

/** 新图片挂在活动单元格左上角，单元格之间自由浮动，随锚点格插删行列移动。 */
export function buildImageDrawing(input: ImageDrawingInput): SheetDrawing {
  const { width, height } = fitImageSize(input.size)
  const payload: ImagePayload = { ...(input.src ? { src: input.src } : {}),
    ...(input.alt ? { alt: input.alt } : {}) }
  return {
    id: input.id, kind: IMAGE_KIND,
    anchor: { row: input.row, col: input.col, offsetX: 0, offsetY: 0, width, height },
    refs: [], payload: { ...payload }, ...(input.media ? { media: input.media } : {}),
  }
}
