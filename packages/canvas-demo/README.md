# @einfach/canvas-demo

Vite + TypeScript 的 Canvas demo 包，使用 `@einfach/canvas` 与 `@einfach/core`。

```sh
pnpm --filter @einfach/canvas-demo dev
```

打开 http://127.0.0.1:5180 。每个页面的显示区只有一张 Canvas，cell 均由 Canvas 2D 绘制。导航、操作按钮和诊断面板是普通 HTML，属于 demo 外壳。

- `/#/bindings`：原始 atom、派生 atom、文字 cell；100 次同步写入只安排一次绘制，观察真实 painter 调用次数。
- `/#/lifecycle`：创建 / 销毁 Canvas cell；销毁后画面擦除、订阅归零，再挂载会读取最新值。
- `/#/cache`：200 / 500 / 1,000 个 Canvas cell；单格或批量重绘、隐藏恢复、atom 身份复用与整份区域缓存失效。支持绿色 hover、拖拽矩形选区、Shift 点击扩展、Escape / 按钮清除；隐藏或销毁区域会清除选区并释放拖拽。高亮、选区边框和活动格全部由 Canvas 绘制。

Vite 将包入口指向相邻 `packages/canvas` 源码，基础包修改直接热更新。每个 demo 独占 store，页面切换清理画布和订阅；网格隐藏只销毁 cell，区域销毁后清空其 store。

```sh
pnpm --filter @einfach/canvas-demo build
pnpm --filter @einfach/canvas-demo test:e2e
```

浏览器测试使用 5181 端口访问生产构建，检查真实 Canvas 像素、绘制命令和生命周期。首次运行需要 `pnpm --filter @einfach/canvas-demo exec playwright install chromium`。截图在 `test-results`。
