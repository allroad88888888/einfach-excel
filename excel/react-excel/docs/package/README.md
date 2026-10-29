# 嵌入 React 工作簿

此包的目标是浏览器 ESM、React 18.3、`@einfach/core` / `@einfach/react` 0.4。
宿主与工作簿必须解析到同一份 Einfach Store、React 绑定和 UI Core；旧 Store 版本或
React 19 不在兼容范围内，需要先对齐版本。预期发行是 React 0.1.0 与 Core/WASM 0.2.0；
工作区保留 pending changesets，尚未应用版本或发布 npm。React 的 UI Core peer 最低为
`^0.2.0`，旧 0.1.0 没有本轮宿主接口。

发布后安装：

```sh
npm install @einfach-excel/react-excel@^0.1.0 @einfach-excel/spreadsheet-ui-core@^0.2.0 \
  @einfach/core@^0.4.0 @einfach/react@^0.4.0 react@^18.3.1 react-dom@^18.3.1
```

未发布候选用仓库根 `pnpm prepare:package-consumers`：在系统 mktemp 副本运行既有
Changesets version、pnpm pack，由仓外 Vite/Rspack 严格安装 tarball 与 registry 依赖。
脚本不修改工作区版本和在途 changesets；消费者不安装 Rust 工具链。

```tsx
import { Spreadsheet } from '@einfach-excel/react-excel'
import type { RustWorkbookDefinition } from '@einfach-excel/spreadsheet-ui-core'
import '@einfach-excel/react-excel/style.css'

const definition: RustWorkbookDefinition = {
  title: 'My workbook',
  sheets: [{ id: 'sheet-1', name: 'Sheet 1', rowCount: 1000, colCount: 20 }],
  createImportChunks: () => [],
}

export function App() {
  return <Spreadsheet definition={definition} style={{ width: '100%', height: 640 }} />
}
```

`definition` 应保持引用稳定。组件会创建一个独立 Store，启动 Core 现有的 Rust runtime，
初始化工作簿和原生函数目录，然后渲染完整工具栏、公式栏、表格和页签。
可传入 `store` 与宿主共享状态；一个 Store 同时只能归属一个挂载中的工作簿。
更换 definition、Store 或 workerFactory 会清理旧 runtime 并启动新的实例。
卸载和失败资源由 Core 统一清理，宿主无需再次终止 Worker。

默认 Worker 通过模块 URL 加载包内编译产物。宿主无需 Lingui 宏插件、`.po` loader、
源码 alias 或 Rust 工具链；`@einfach-excel/spreadsheet-ui-core` 及其 `@einfach-excel/excel-wasm`
必须提供已构建的匹配发行物。受 CSP、资源路径或特殊打包约束时，可明确传入
`workerFactory={() => new Worker(/* 宿主自己的模块 URL */, { type: 'module' })}`。
每次工厂调用必须返回一个全新的、实现 Core `WorkerLike` 协议的 Worker，不能共享活动实例。

自定义入口可直接复用 Core 发行叶，Vite/Rspack 无需专属 Worker loader：

```ts
// workbook.worker.ts
import '@einfach-excel/spreadsheet-ui-core/rust-runtime'
// 宿主组件的稳定 factory：() => new Worker(
//   new URL('./workbook.worker.ts', import.meta.url), { type: 'module' })
```

将 workerFactory 保持为稳定函数，避免每次宿主 render 重建工作簿。默认 Worker 包含预编译
WASM；自定义入口由消费者 bundler 处理 Core 对 WASM 的引用。CSP 需允许实际脚本、Worker 与
WASM 来源；本轮只验证本地同源 Vite/Rspack，未验证严格 CSP 或 CDN 跨域部署。

包根还导出 `WorkbookRuntimeProvider`、`WorkbookStoreProvider`、`WorkbookView` 及其 props
类型。前者允许在同一 runtime 中挂载自定义 React 子树；后两者用于已经由宿主配置好的
Core Store/connection。仅向 `WorkbookStoreProvider` 传入 connection 不会初始化文档和
原生函数目录，不能据此取得完整初始工作簿。Core 类型从 Core 包导入，本包不转导出 Core barrel。

## 尺寸与展现配置

`Spreadsheet` 的 `className`、`style` 作用于 `.einfach-spreadsheet` 根。根默认填满父容器，
父容器需有明确高度，或像示例一样直接设置 `height`。组件只滚动自己的网格，不修改
宿主 `html`、`body`、`#root` 或文档滚动；主题 token 与 reset 均限定在组件根。
响应式工具栏按组件容器宽度换行，因此同一桌面页面中的窄工作簿也可使用完整入口。
也可直接使用 Provider + `WorkbookView`，视图会提供同一个样式域。

两个 Provider 与 `Spreadsheet` 都接受 `locale?: 'en' | 'zh'`、`i18n?: I18n`、
`renderer?: 'dom' | 'canvas'`。默认各自创建英文 Lingui 实例，语言下拉仅切换本实例；
显式 `locale` 表示宿主控制语言，下拉会禁用，宿主通过更新该 prop 切换。
提供 `i18n` 而不提供 `locale` 时，保留该实例当前语言及宿主词典，包含 en/zh 以外的语言。
宿主负责该实例所需的词典；只有显式传入同一个 I18n 才会共享语言变化。
共享 I18n 的多个工作簿应使用一致的受控 locale，避免同一实例接收相互矛盾的配置。

默认 renderer 为 DOM；Canvas 只能通过 `renderer="canvas"` 选择。语言和 renderer
变化不会重建工作簿或清空历史。库不读取或改写宿主 URL、浏览器语言和 localStorage。
演示站继续独立读取 `?locale=`、`?renderer=canvas`，并保存语言偏好。

## 构建与检查

先构建 Core 的发行版 JS/声明并准备预编译 WASM，然后在仓库执行：

```sh
pnpm --filter @einfach-excel/react-excel build:lib
pnpm --filter @einfach-excel/react-excel build:demo
```

库位于 `dist/`，demo 位于 `dist-demo/`；`build` 依次构建两者。
`dist/artifact-manifest.json` 列出产物、外部依赖、peer 及内联实现，可供集成自动检查。
`files` 白名单只打包库与本文档，排除 demo、源码、test、e2e 与构建脚本。
React、react-dom、Einfach core/react、UI Core 保留 peer 身份；私有 cells/canvas 实现已内联。
Lingui 运行时为普通发行依赖，宏和中英目录已在库侧编译。

[原始值、事务、事件与控制](host-data.md)说明宿主契约；[发行清单](release.md)列出
消费者命令与兼容边界。工作区的构建成功不等于 npm 已发布。
