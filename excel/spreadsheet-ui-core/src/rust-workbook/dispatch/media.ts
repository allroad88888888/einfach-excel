import { putMedia, readMedia } from '../media/command'
import type { WorkbookHandlers } from './context'

/** 图片字节：存入不推进修订（对象引用它时才是一次修改），读取只读。 */
export const mediaHandlers: WorkbookHandlers = {
  'media.put': (_context, current, input) => putMedia(current, input),
  'media.read': (_context, current, input) => readMedia(current, input),
}
