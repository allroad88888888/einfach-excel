import { buildImageDrawing, fitImageSize, nextImageId, validImageUrl } from '../src/core'

describe('image drawings', () => {
  it('fits large pictures and keeps small ones', () => {
    expect(fitImageSize({ width: 1920, height: 1080 })).toEqual({ width: 480, height: 270 })
    expect(fitImageSize({ width: 100, height: 50 })).toEqual({ width: 100, height: 50 })
    expect(fitImageSize(null)).toEqual({ width: 320, height: 240 })
  })

  it('accepts only http(s) addresses', () => {
    expect(validImageUrl(' https://example.com/a.png ')).toBe('https://example.com/a.png')
    expect(validImageUrl('javascript:alert(1)')).toBeNull()
    expect(validImageUrl('data:image/png;base64,AAAA')).toBeNull()
    expect(validImageUrl('not a url')).toBeNull()
  })

  it('anchors at the active cell and references media or a url', () => {
    const local = buildImageDrawing({ id: 'image-1', row: 2, col: 3,
      size: { width: 40, height: 20 }, media: 'm1', alt: 'logo' })
    expect(local).toEqual({ id: 'image-1', kind: 'image', media: 'm1', refs: [],
      anchor: { row: 2, col: 3, offsetX: 0, offsetY: 0, width: 40, height: 20 },
      payload: { alt: 'logo' } })
    const linked = buildImageDrawing({ id: 'image-2', row: 0, col: 0, size: null,
      src: 'https://example.com/a.png' })
    expect(linked.media).toBeUndefined()
    expect(linked.payload).toEqual({ src: 'https://example.com/a.png' })
  })

  it('numbers ids without collisions', () => {
    expect(nextImageId([{ id: 'image-2' } as never])).toBe('image-3')
  })
})
