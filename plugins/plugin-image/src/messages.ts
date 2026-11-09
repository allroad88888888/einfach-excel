import type { Messages } from '@lingui/core'

export const labels = {
  image: { id: 'plugin.image.kind', message: 'Picture' },
  group: { id: 'plugin.image.group', message: 'Pictures' },
  fromFile: { id: 'plugin.image.fromFile', message: 'Insert picture from file' },
  fromUrl: { id: 'plugin.image.fromUrl', message: 'Insert picture from address' },
  url: { id: 'plugin.image.url', message: 'Picture address' },
  insert: { id: 'plugin.image.insert', message: 'Insert' },
  cancel: { id: 'plugin.image.cancel', message: 'Cancel' },
  close: { id: 'plugin.image.close', message: 'Close' },
  missing: { id: 'plugin.image.missing', message: 'Picture unavailable' },
}
const errors: Record<string, string> = {
  'Enter an http or https image address.': '请输入 http 或 https 图片地址。',
  'An image cannot exceed 10 MiB.': '图片不能超过 10 MiB。',
  'Only PNG, JPEG, GIF, WebP and BMP images are supported.': '只支持 PNG、JPEG、GIF、WebP 和 BMP 图片。',
  'A workbook can hold at most 200 MiB of images.': '一个工作簿最多存 200 MiB 图片。',
  'The workbook is not ready.': '工作簿尚未准备好。',
  'The picture upload failed.': '图片上传失败。',
  'A worksheet can hold at most 1000 objects.': '一张工作表最多 1000 个对象。',
}
export const messages: Partial<Record<'en' | 'zh', Messages>> = {
  en: { ...Object.fromEntries(Object.keys(errors).map((key) => [key, key])),
    ...Object.fromEntries(Object.values(labels).map(({ id, message }) => [id, message])) },
  zh: { ...errors,
    [labels.image.id]: '图片',
    [labels.group.id]: '图片',
    [labels.fromFile.id]: '从文件插入图片',
    [labels.fromUrl.id]: '从地址插入图片',
    [labels.url.id]: '图片地址',
    [labels.insert.id]: '插入',
    [labels.cancel.id]: '取消',
    [labels.close.id]: '关闭',
    [labels.missing.id]: '图片无法显示',
  },
}
