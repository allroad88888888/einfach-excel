# @einfach-excel/plugin-image

浮动图片：「插入」组从文件或 http(s) 地址插入，挂在活动单元格，拖动、缩放、删除、撤销由工作簿对象层负责。

```tsx
import { createImagePlugin, imagePlugin } from '@einfach-excel/plugin-image'

<Spreadsheet plugins={[imagePlugin]} />
// 宿主上传：文件交给宿主，工作簿只存返回的地址
<Spreadsheet plugins={[createImagePlugin({ upload: async (file) => myUpload(file) })]} />
```

- 没有上传钩子时，字节存进 Rust 工作簿媒体库（`media.put`，按内容去重，PNG/JPEG/GIF/WebP/BMP，
  单张 ≤10 MiB、整簿 ≤200 MiB），对象经 `drawing.media` 引用；`.einfach.json` 只写仍被引用的图片（Base64）。
- 地址图片只存 `payload.src`，只接受 http/https；加载失败显示占位。
