# @einfach/canvas

Canvas cell 的基础包：cell 生命周期、atom 直接订阅、按帧合并重绘、区域缓存。

借鉴 Solid 的 owner / cleanup 生命周期。状态与派生依赖继续由 `@einfach/core` 管理；`useAtomValue` 在 cell 初始化时直接调用 `store.sub`，通知时标记这个 cell 待重绘，销毁时调用 unsubscribe。没有 DOM 绑定、JSX、props 系统或另一套响应式计算图。

```ts
import { atom, createStore } from '@einfach/core'
import { createCanvas, useAtomValue, useCache } from '@einfach/canvas'

const store = createStore()
const surface = createCanvas(canvasElement, { store, width: 800, height: 600 })
const getCellAtom = surface.run(() => useCache((id: number) => atom(id)))

const cell = surface.createCell({ x: 0, y: 0, width: 100, height: 32 }, () => {
  const value = useAtomValue(getCellAtom(0)) // 初始化只执行一次，立即订阅
  return (ctx, rect) => {                  // requestAnimationFrame 中绘制
    ctx.fillStyle = '#fff'
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
    ctx.fillStyle = '#27364c'
    ctx.fillText(String(value()), rect.x + 8, rect.y + 22)
  }
})

store.setter(getCellAtom(0), 42) // 标记 cell 待重绘，自动安排下一帧
cell.dispose()                 // 取消订阅，下一帧清除原绘制区域
surface.dispose()              // 销毁所有 cell、清空画布、取消帧、使缓存失效
```

`createCanvas` 建立独立的区域 root，由调用方负责 `dispose()`。`createCell(bounds, setup)` 创建这个区域的子生命周期，setup 返回 painter。painter 只负责绘图，通过初始化时得到的 getter 读取最新 atom 值；不要在 painter 中创建订阅。

同一帧的多次通知会合并。绘制时先清除脏区域，再按创建顺序重绘与脏区域相交的 cell；每个 painter 被裁剪到自身 bounds。这样重叠 cell 在局部更新或删除后仍保持正确的覆盖关系。适合矩形 cell；布局与虚拟滚动由上层负责。

在 cell setup 中使用 `onPointerDown`、`onPointerMove`、`onPointerUp`、`onPointerCancel`、`onPointerEnter`、`onPointerLeave` 注册事件。每张 Canvas 统一监听原生事件，按绘制顺序反向命中矩形 cell。事件包含原生 `nativeEvent`、画布逻辑坐标 `x/y` 和 cell 内坐标 `localX/localY`；不建立冒泡树。

按下时调用 `event.capturePointer()`，后续 move/up 会继续发给该 cell，即使指针已经移出画布。up/cancel 自动释放，也可以调用 `event.releasePointer()`。hover 独立命中实际指针所在 cell；滚动会重新计算 hover。cell 销毁时先发送取消和离开事件，再移除处理函数；区域销毁移除所有原生监听。选区、Shift 扩展和 Escape 等业务行为由 demo 实现，未包含拖拽自动滚动。

| API | 行为 |
| --- | --- |
| `surface.createCell(bounds, setup)` | 创建 cell，返回 `{ invalidate, dispose }` |
| `surface.run(fn)` | 进入区域 owner，适合创建共享缓存 |
| `surface.invalidate()` | 标记整个画布待重绘 |
| `surface.flush()` | 立即执行待绘制内容，便于显式同步或测试 |
| `surface.resize(width, height, pixelRatio?)` | 使用逻辑像素尺寸，按像素比例调整画布并重绘 |
| `surface.dispose()` | 同步解绑资源并清空画布，可重复调用 |
| `useAtomValue(atom, { store? })` | 在 cell setup 中直接订阅，返回读取当前值的 getter |
| `useSetAtom(atom, { store? })` | 获得 Core setter |
| `onCleanup(fn)` | 注册当前 cell / owner 的清理逻辑 |
| `useCache(factory, equality?)` | 同区域共享 factory 与参数对应的结果 |

`createRoot`、`createScope`、`getOwner`、`runWithOwner` 与 context 原语供上层组织生命周期。scope 随父级销毁，root 需要独立销毁。清理失败仍会继续释放其余资源，再抛出错误。

缓存借鉴现有区域缓存：WeakMap 弱引用 factory，参数和结果在区域存活时保留。子 cell 销毁不会删掉区域缓存；区域销毁主动清空整个缓存，已有缓存包装函数随后调用会报错。默认逐项 `Object.is` 比较参数，也支持完整参数数组比较器。factory 应创建 atom 定义或普通数据。

Canvas 创建时捕获 `devicePixelRatio`，可通过 `resize` 更新。painter 坐标始终是逻辑像素。`onFrame({ cells, elapsed })` 报告实际调用的 painter 数与同步绘制耗时，不包含浏览器合成。

本包只清理自己的订阅和缓存，不会对传入的共享 store 自动调用 `clear()`；Core 的派生 atom 依赖图仍由 Core 管理。区域若独占 store，可在 `surface.dispose()` 后清理该 store。

```sh
pnpm --filter @einfach/canvas test
pnpm --filter @einfach/canvas typecheck
pnpm --filter @einfach/canvas build
pnpm --filter @einfach/canvas-demo dev
```

规则网格可以设置 `pointerEvents: false` 关闭通用 cell 事件分发，由上层使用行列索引实现命中；这时 `onPointer*` hooks 不会收到事件。`canvas-cells` 使用此模式，避免每次指针移动扫描 cell。

`setViewport(rect)` 指定画布显示的世界坐标区域，实际像素缓冲只按其宽高分配。`CanvasCell.setBounds(rect)` 更新 cell 位置并清理旧区域，不重建 owner 或订阅。对按世界坐标绘制并正确调用失效通知的 painter，可设置 `reusePixels: true`，滚动时复制重叠像素并补画新露出的区域；不满足精确像素平移条件时自动完整重画。
