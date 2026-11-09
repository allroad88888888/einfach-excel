import { atom } from '@einfach/core'

/** 「从地址插入」小表单：是否展开与输入草稿。 */
const urlFormAtom = atom({ open: false, text: '' })
urlFormAtom.debugLabel = 'plugin.image.urlForm.state'
export const imageUrlFormAtom = atom((get) => get(urlFormAtom))
imageUrlFormAtom.debugLabel = 'plugin.image.urlForm'
export const setImageUrlFormAtom = atom(null,
  (get, set, patch: { readonly open?: boolean; readonly text?: string }) =>
    set(urlFormAtom, { ...get(urlFormAtom), ...patch }))
setImageUrlFormAtom.debugLabel = 'plugin.image.urlForm.set'

/** 本次会话里加载失败的外链（只影响显示，不进工作簿）；有上限，旧的先忘掉。 */
const MAX_BROKEN = 256
const brokenAtom = atom<readonly string[]>([])
brokenAtom.debugLabel = 'plugin.image.broken.state'
export const brokenImagesAtom = atom((get) => new Set(get(brokenAtom)))
brokenImagesAtom.debugLabel = 'plugin.image.broken'
export const markImageBrokenAtom = atom(null, (get, set, src: string) => {
  const list = get(brokenAtom)
  if (!list.includes(src)) set(brokenAtom, [...list, src].slice(-MAX_BROKEN))
})
markImageBrokenAtom.debugLabel = 'plugin.image.broken.mark'
