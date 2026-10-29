import { atom } from '@einfach/core'
import { createCanvas, onCleanup, useAtomValue, type CanvasCell } from '@einfach-excel/canvas'
import { action, element, find, observedStore, write } from '../ui'
import { drawCard } from '../drawing'

export function lifecyclePage(): HTMLElement {
  const probe = observedStore()
  const source = atom(0)
  const node = element(`<section>
    <div class="experiment-grid"><article class="panel"><div class="panel-heading"><h2>Canvas cell 的生命周期</h2><span class="pill" data-value="status">已挂载</span></div>
      <div class="canvas-scroll canvas-checker"><canvas aria-label="生命周期 Canvas"></canvas></div>
      <div class="button-row"><button class="primary" data-action="toggle">销毁 cell</button><button data-action="update">更新源 atom +1</button><button data-action="auto" aria-pressed="false">自动更新</button></div>
      <p class="hint">销毁后，Canvas 上的 cell 被擦除，订阅归零。此时继续写入 atom 不会触发绘制。</p></article>
      <aside class="panel diagnostics"><div class="panel-heading"><h2>资源观察</h2></div><dl><div><dt>源 atom 当前值</dt><dd data-value="source">0</dd></div><div><dt>cell 订阅</dt><dd data-value="subscriptions">0</dd></div><div><dt>累计挂载 / 销毁</dt><dd><span data-value="mounts">0</span> / <span data-value="disposals">0</span></dd></div><div><dt>cell 绘制累计执行</dt><dd data-value="paints">0</dd></div></dl></aside></div>
    <article class="panel"><div class="panel-heading"><h2>生命周期记录</h2><span class="label">最近 12 条</span></div><ol class="event-log"></ol></article>
    <details class="code-panel"><summary>查看关键代码</summary><pre><code>const cell = surface.createCell(rect, () =&gt; {
  const value = useAtomValue(atom)
  return ctx =&gt; ctx.fillText(String(value()), x, y)
})
cell.dispose() // 解绑 atom，标记旧区域待清除</code></pre></details>
  </section>`)
  const surface = createCanvas(find<HTMLCanvasElement>(node, 'canvas'), {
    store: probe.store, width: 640, height: 240,
  })
  let cell: CanvasCell | undefined
  let interval: ReturnType<typeof setInterval> | undefined
  let mounts = 0
  let disposals = 0
  let paints = 0
  let sequence = 0
  function log(message: string) {
    const row = element('<li><span class="log-number"></span><span class="log-message"></span></li>')
    find(row, '.log-number').textContent = String(++sequence).padStart(2, '0')
    find(row, '.log-message').textContent = message
    const list = find(node, '.event-log')
    list.prepend(row)
    while (list.children.length > 12) list.lastElementChild?.remove()
  }
  function refresh() {
    write(node, 'source', probe.store.getter(source))
    write(node, 'subscriptions', probe.subscriptions())
    write(node, 'mounts', mounts)
    write(node, 'disposals', disposals)
    write(node, 'status', cell ? '已挂载' : '已销毁')
    find(node, '[data-action="toggle"]').textContent = cell ? '销毁 cell' : '重新挂载 cell'
  }
  function mount() {
    cell = surface.createCell({ x: 140, y: 30, width: 360, height: 180 }, () => {
      mounts++
      const value = useAtomValue(source)
      onCleanup(() => { disposals++ })
      return (ctx, rect) => {
        drawCard(ctx, rect, 'CELL A1 · 独立生命周期', String(value()))
        write(node, 'paints', ++paints)
      }
    })
    log(`创建 cell #${mounts}，订阅 atom 并安排绘制`)
    refresh()
  }
  function update() {
    probe.store.setter(source, probe.store.getter(source) + 1)
    log(cell ? '源 atom 更新，cell 标记为待重绘' : '源 atom 更新，已销毁的 cell 不会绘制')
    refresh()
  }
  action(node, 'toggle', () => {
    if (!cell) { mount(); return }
    cell.dispose()
    cell = undefined
    log('销毁 cell，解绑订阅并清除原绘制区域')
    refresh()
  })
  action(node, 'update', update)
  action(node, 'auto', () => {
    if (interval) { clearInterval(interval); interval = undefined } else {
      interval = setInterval(update, 600)
    }
    const button = find(node, '[data-action="auto"]')
    button.textContent = interval ? '停止自动更新' : '自动更新'
    button.setAttribute('aria-pressed', String(Boolean(interval)))
  })
  onCleanup(() => { clearInterval(interval); surface.dispose(); probe.store.clear() })
  mount()
  return node
}
