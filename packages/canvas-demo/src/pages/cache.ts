import { onCleanup } from '@einfach-excel/canvas'
import { createGridRegion } from '../grid-region'
import { action, element, find, listen, write } from '../ui'

export function cachePage(): HTMLElement {
  const node = element(`<section>
    <article class="panel grid-panel"><div class="panel-heading"><div><h2>一张 Canvas，独立的 cell 生命周期</h2><p class="hint">更新 1 格只绘制 1 格。隐藏再显示，复用这块区域里的 atom。</p></div><span class="pill" data-value="region">区域 #1</span></div>
      <div class="grid-toolbar"><div class="button-row"><button class="primary" data-action="one">更新 1 格</button><button data-action="hundred">随机更新 100 格</button><button data-action="visibility">隐藏 cell</button></div><label class="select-field">规模<select aria-label="网格规模"><option value="10">200 cells</option><option value="25" selected>500 cells</option><option value="50">1,000 cells</option></select></label></div>
      <div class="selection-bar"><span>悬停 <strong data-value="hover">—</strong></span><span>选区 <strong data-value="selection">—</strong></span><span><strong data-value="selected-count">0</strong> 格</span><button class="quiet" data-action="clear">清除选区</button></div>
      <div class="grid-viewport" tabindex="0" aria-label="可滚动的 Canvas 网格"><canvas tabindex="0" aria-label="Cell 网格 Canvas"></canvas></div>
      <div class="grid-legend"><span><i></i> 蓝色选区 · 绿色悬停</span><span>拖拽框选 · Shift + 点击扩展 · Esc 清除</span></div></article>
    <div class="metrics-strip"><div><span>已创建 atom</span><strong data-value="atoms">0</strong></div><div><span>当前 cell 订阅</span><strong data-value="subscriptions">0</strong></div><div><span>累计 cell 创建</span><strong data-value="cells">0</strong></div><div><span>最近一帧绘制 cell</span><strong data-value="painted">0</strong></div><div><span>绘制耗时</span><strong><span data-value="elapsed">—</span><small> ms</small></strong></div></div>
    <article class="panel region-panel"><div><h2>区域的生命周期</h2><p class="hint" data-value="cache-message">隐藏 cell 会解绑，销毁区域会让整份缓存失效。</p></div><div class="button-row"><button data-action="destroy">销毁区域</button><button data-action="recreate" disabled>重新创建区域</button></div></article>
    <p class="measurement-note">耗时统计 Canvas 绘制命令的执行，不包含浏览器后续合成。</p>
    <details class="code-panel"><summary>查看关键代码</summary><pre><code>const getCell = surface.run(() =&gt; useCache(index =&gt; atom(index)))
const cell = surface.createCell(rect, () =&gt; {
  const value = useAtomValue(getCell(index))
  return (ctx, bounds) =&gt; drawCell(ctx, bounds, value())
})
cell.dispose()    // 解绑订阅，清除 cell 的绘制区域
surface.dispose() // 清理整个区域，缓存失效</code></pre></details>
  </section>`)
  const canvas = find<HTMLCanvasElement>(node, 'canvas')
  const select = find<HTMLSelectElement>(node, 'select')
  let generation = 1
  let hidden = false
  function createRegion() {
    return createGridRegion(canvas, Number(select.value), stats => {
      write(node, 'painted', stats.cells)
      write(node, 'elapsed', stats.elapsed.toFixed(2))
    }, info => {
      write(node, 'hover', info.hover)
      write(node, 'selection', info.range)
      write(node, 'selected-count', info.count)
    })
  }
  let region: ReturnType<typeof createRegion> | undefined = createRegion()
  function refresh() {
    const stats = region?.stats()
    write(node, 'atoms', stats?.createdAtoms ?? 0)
    write(node, 'subscriptions', stats?.subscriptions ?? 0)
    write(node, 'cells', stats?.createdCells ?? 0)
    write(node, 'region', region ? `区域 #${generation}${hidden ? ' · cell 已隐藏' : ''}` : '区域已销毁')
    for (const name of ['one', 'hundred', 'visibility', 'destroy', 'clear']) {
      find<HTMLButtonElement>(node, `[data-action="${name}"]`).disabled = !region
    }
    find<HTMLButtonElement>(node, '[data-action="recreate"]').disabled = Boolean(region)
    find(node, '[data-action="visibility"]').textContent = hidden ? '显示 cell' : '隐藏 cell'
    select.disabled = !region
  }
  function update(count: number) {
    write(node, 'painted', 0)
    region?.update(count)
    refresh()
  }
  action(node, 'one', () => update(1))
  action(node, 'hundred', () => update(100))
  action(node, 'clear', () => region?.clearSelection())
  action(node, 'visibility', () => {
    if (!region) return
    hidden = !hidden
    if (hidden) region.hide()
    else {
      const original = region.getCell(0)
      region.show()
      write(node, 'cache-message', region.getCell(0) === original
        ? '身份检查通过：重新显示后，第一格仍使用同一个 atom。' : 'atom 身份发生变化。')
    }
    refresh()
  })
  listen(select, 'change', () => {
    hidden = false
    region?.show(Number(select.value))
    refresh()
  })
  action(node, 'destroy', () => {
    if (!region) return
    const oldCache = region.getCell
    region.dispose()
    region = undefined
    hidden = false
    try { oldCache(0) } catch {
      write(node, 'cache-message', '失效检查通过：旧缓存函数拒绝访问，Canvas 已清空，订阅已解绑。')
    }
    write(node, 'painted', 0)
    write(node, 'elapsed', '—')
    refresh()
  })
  action(node, 'recreate', () => {
    generation++
    region = createRegion()
    write(node, 'cache-message', '已创建新区域：独立的 store、缓存与 Canvas cell 生命周期。')
    refresh()
  })
  onCleanup(() => region?.dispose())
  refresh()
  return node
}
