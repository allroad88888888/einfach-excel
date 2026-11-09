import type { ImageSize } from './core'

/** 浏览器解码量出原始像素尺寸；解不出（格式不支持、外链跨域失败）返回 null，用默认尺寸。 */
export async function measureBlob(blob: Blob): Promise<ImageSize | null> {
  if (typeof createImageBitmap !== 'function') return null
  try {
    const bitmap = await createImageBitmap(blob)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return size
  } catch {
    return null
  }
}

export function measureUrl(url: string): Promise<ImageSize | null> {
  return new Promise((resolve) => {
    const image = new Image()
    const timer = setTimeout(() => resolve(null), 5000)
    image.onload = () => {
      clearTimeout(timer)
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => { clearTimeout(timer); resolve(null) }
    image.src = url
  })
}
