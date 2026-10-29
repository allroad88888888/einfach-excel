import { atom } from '@einfach/core'
import { createCanvas, onCleanup, useAtomValue } from '@einfach-excel/canvas'
import { action, element, find, listen, observedStore, write } from '../ui'
import { drawCard } from '../drawing'

export function bindingsPage(): HTMLElement {
  const probe = observedStore()
  const countAtom = atom(0)
  const nameAtom = atom('Hello, canvas')
  const doubleAtom = atom(get => get(countAtom) * 2)
  const node = element(`<section>
    <div class="experiment-grid">
      <article class="panel"><div class="panel-heading"><h2>一张 Canvas，三个 cell</h2><span class="pill">Canvas 2D</span></div>
        <div class="canvas-scroll"><canvas aria-label="数字与文字 Canvas"></canvas></div>
        <div class="button-row"><button data-action="minus">− 1</button><button class="primary" data-action="plus">加一 +</button><button data-action="hundred">连续写入 100 次</button><button class="quiet" data-action="reset">归零</button></div>
        <p class="hint">100 次同步写入只安排一帧绘制。数字、文字、背景均由 Canvas 绘制。</p>
        <label class="field canvas-input">修改文字 cell<input aria-label="演示文字" value="Hello, canvas" maxlength="30" /></label>
      </article>
      <aside class="panel diagnostics"><div class="panel-heading"><h2>实际绘制记录</h2><span class="live-dot"></span></div>
        <dl><div><dt>cell 创建次数</dt><dd data-value="mounts">0</dd></div><div><dt>原始值绘制次数</dt><dd data-value="count-paints">0</dd></div><div><dt>派生值绘制次数</dt><dd data-value="double-paints">0</dd></div><div><dt>文字绘制次数</dt><dd data-value="text-paints">0</dd></div><div><dt>当前订阅</dt><dd data-value="subscriptions">0</dd></div><div><dt>最近一帧绘制 cell</dt><dd data-value="painted">0</dd></div></dl>
        <p class="hint">计数在 painter 真正执行时增加。Canvas 中没有每格对应的 HTML 节点。</p>
      </aside>
    </div>
    <details class="code-panel" open><summary>Canvas cell 的全部流程</summary><pre><code>surface.createCell(bounds, () =&gt; {
  const value = useAtomValue(valueAtom) // 创建时订阅
  return (ctx, rect) =&gt; {            // 下一帧绘制
    ctx.fillText(String(value()), rect.x + 16, rect.y + 30)
  }
}) // cell.dispose() 自动取消订阅</code></pre></details>
  </section>`)
  let mounts = 0
  let countPaints = 0
  let doublePaints = 0
  let textPaints = 0
  const surface = createCanvas(find<HTMLCanvasElement>(node, 'canvas'), {
    store: probe.store, width: 640, height: 310,
    onFrame: stats => write(node, 'painted', stats.cells),
  })
  onCleanup(() => { surface.dispose(); probe.store.clear() })
  surface.createCell({ x: 0, y: 0, width: 310, height: 180 }, () => {
    const value = useAtomValue(countAtom)
    write(node, 'mounts', ++mounts)
    return (ctx, rect) => {
      drawCard(ctx, rect, '原始值', String(value()), '#27364c')
      write(node, 'count-paints', ++countPaints)
    }
  })
  surface.createCell({ x: 330, y: 0, width: 310, height: 180 }, () => {
    const value = useAtomValue(doubleAtom)
    write(node, 'mounts', ++mounts)
    return (ctx, rect) => {
      drawCard(ctx, rect, '派生值 × 2', String(value()), '#315cda')
      write(node, 'double-paints', ++doublePaints)
    }
  })
  surface.createCell({ x: 0, y: 200, width: 640, height: 100 }, () => {
    const value = useAtomValue(nameAtom)
    write(node, 'mounts', ++mounts)
    return (ctx, rect) => {
      drawCard(ctx, rect, '独立的文字 cell', value() || '等待输入…', '#315cda', 24)
      write(node, 'text-paints', ++textPaints)
    }
  })
  const change = () => probe.store.setter(countAtom, probe.store.getter(countAtom) + 1)
  action(node, 'plus', change)
  action(node, 'minus', () => probe.store.setter(countAtom, probe.store.getter(countAtom) - 1))
  action(node, 'reset', () => probe.store.setter(countAtom, 0))
  action(node, 'hundred', () => { for (let i = 0; i < 100; i++) change() })
  const input = find<HTMLInputElement>(node, 'input')
  listen(input, 'input', () => probe.store.setter(nameAtom, input.value))
  write(node, 'subscriptions', probe.subscriptions())
  return node
}
