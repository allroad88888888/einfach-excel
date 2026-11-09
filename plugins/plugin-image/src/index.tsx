import type { SpreadsheetPlugin } from '@einfach-excel/react-excel'
import { IMAGE_KIND } from './core'
import { ImageView } from './ImageView'
import { createInsertImageTools, type ImageUpload } from './InsertImageTools'
import { labels, messages } from './messages'
import './image.css'

export type { ImageUpload }

export interface ImagePluginOptions {
  /** 提供时本地文件先交给宿主上传，工作簿只存返回的地址；缺省时字节存进工作簿。 */
  readonly upload?: ImageUpload
}

/** 浮动图片插件：从文件或地址插入；位置、缩放、删除、撤销由工作簿对象层负责。 */
export function createImagePlugin(options: ImagePluginOptions = {}): SpreadsheetPlugin {
  return {
    id: 'image',
    ribbon: [{ id: 'image.insert', tab: 'Insert', Group: createInsertImageTools(options.upload) }],
    drawings: [{ kind: IMAGE_KIND, label: labels.image, Renderer: ImageView }],
    messages,
  }
}

export const imagePlugin: SpreadsheetPlugin = createImagePlugin()
