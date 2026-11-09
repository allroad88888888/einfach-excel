import { atom } from '@einfach/core'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook/commands'

export type MediaResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly error: string }

export interface MediaUrlEntry {
  readonly status: 'loading' | 'ready' | 'error'
  readonly url?: string
  readonly error?: string
}
interface MediaCache {
  readonly connection: RustWorkbookConnection
  readonly entries: ReadonlyMap<string, MediaUrlEntry>
}
/** 图片显示用的 Blob URL 有界缓存；超过上限先释放最早的。换连接即整体作废。 */
const MAX_CACHED_URLS = 256
const cacheAtom = atom<MediaCache | null>(null)
cacheAtom.debugLabel = 'spreadsheet.media.urls.cache'

const message = (error: unknown) => error instanceof Error ? error.message : String(error)

/** 存入一张图片的字节，返回工作簿内的 id；类型、大小由 Rust 校验。 */
export const putWorkbookMediaAtom = atom(null,
  async (get, _set, bytes: Uint8Array): Promise<MediaResult> => {
    const connection = get(rustWorkbookConnectionAtom)
    if (!connection) return { ok: false, error: 'The workbook is not ready.' }
    try {
      const reply = await connection.request('media.put', { bytes })
      return typeof reply?.id === 'string' ? { ok: true, id: reply.id }
        : { ok: false, error: 'Rust returned an invalid image id.' }
    } catch (error) {
      return { ok: false, error: message(error) }
    }
  })
putWorkbookMediaAtom.debugLabel = 'spreadsheet.media.put'

/** 读一张图片的原始字节（导出等用途）；不进缓存。 */
export const readWorkbookMediaAtom = atom(null, async (get, _set, id: string) => {
  const connection = get(rustWorkbookConnectionAtom)
  if (!connection) throw new Error('The workbook is not ready.')
  return connection.request('media.read', { id })
})
readWorkbookMediaAtom.debugLabel = 'spreadsheet.media.read'

const EMPTY: ReadonlyMap<string, MediaUrlEntry> = new Map()
export const workbookMediaUrlsAtom = atom((get): ReadonlyMap<string, MediaUrlEntry> => {
  const cache = get(cacheAtom)
  return cache && cache.connection === get(rustWorkbookConnectionAtom) ? cache.entries : EMPTY
})
workbookMediaUrlsAtom.debugLabel = 'spreadsheet.media.urls'

function withEntry(cache: MediaCache, id: string, entry: MediaUrlEntry): MediaCache {
  const entries = new Map(cache.entries)
  entries.delete(id)
  entries.set(id, entry)
  for (const [oldId, old] of entries) {
    if (entries.size <= MAX_CACHED_URLS) break
    if (old.url) URL.revokeObjectURL(old.url)
    entries.delete(oldId)
  }
  return { connection: cache.connection, entries }
}

/** 确保某张图片有可显示的 URL；已在缓存（含加载中）不重复读取。 */
export const loadWorkbookMediaAtom = atom(null, async (get, set, id: string): Promise<void> => {
  const connection = get(rustWorkbookConnectionAtom)
  if (!connection) return
  let cache = get(cacheAtom)
  if (cache?.connection !== connection) {
    for (const entry of cache?.entries.values() ?? []) if (entry.url) URL.revokeObjectURL(entry.url)
    cache = { connection, entries: new Map() }
  }
  if (cache.entries.has(id)) return
  set(cacheAtom, withEntry(cache, id, { status: 'loading' }))
  let entry: MediaUrlEntry
  try {
    const reply = await connection.request('media.read', { id })
    entry = { status: 'ready',
      url: URL.createObjectURL(new Blob([reply.bytes as BlobPart], { type: reply.mime })) }
  } catch (error) {
    entry = { status: 'error', error: message(error) }
  }
  const current = get(cacheAtom)
  if (current?.connection !== connection) {
    if (entry.url) URL.revokeObjectURL(entry.url)
    return
  }
  set(cacheAtom, withEntry(current, id, entry))
})
loadWorkbookMediaAtom.debugLabel = 'spreadsheet.media.load'
