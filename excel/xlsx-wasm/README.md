# @einfach-excel/xlsx

XLSX ⇄ einfach 原生工作簿文件（`.einfach.json`）转换器，Rust 源码在 `excel/rust/xlsx`，
编译成独立 WASM，宿主只在用户打开或导出 XLSX 时才加载，不增加工作簿主包体积。

```ts
import init, { xlsxToNative, nativeToXlsx } from '@einfach-excel/xlsx'

await init()
const native = xlsxToNative(new Uint8Array(await file.arrayBuffer()), 'Book') // 原生文件文本
const bytes = nativeToXlsx(native) // Uint8Array
```

当前转换范围：工作表与表名、文本/数字/布尔/错误值、公式（含共享公式展开、动态数组锚点、
`_xlfn.` 前缀）、字体/填充/边框/对齐/换行/缩进、数字格式、合并、冻结窗格、列宽行高。
批注、Table、条件格式、数据验证、名称、图片图表等暂不转换；导出时这些原生内容会丢失。
1904 日期系统的文件会被拒绝。

尚未发布（`private: true`），发布时机见仓库进度说明。
