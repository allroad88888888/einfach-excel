import { createRoot, onCleanup } from '@einfach-excel/canvas'
import { bindingsPage } from './pages/bindings'
import { lifecyclePage } from './pages/lifecycle'
import { cachePage } from './pages/cache'
import { element, find, listen } from './ui'
import './styles/base.css'
import './styles/demos.css'

const pages = {
  bindings: { title: 'Canvas 重绘', subtitle: 'atom 直接订阅，变化只触发对应 cell 的重绘。', create: bindingsPage },
  lifecycle: { title: '挂载与销毁', subtitle: '让一个 cell 出现、离开，再重新回来。', create: lifecyclePage },
  cache: { title: '区域缓存', subtitle: 'cell 可以重建，区域里的 atom 可以复用。', create: cachePage },
}
type PageName = keyof typeof pages

function App() {
  const shell = element(`<div class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="#/bindings"><span class="brand-mark">e</span><span>einfach<span class="brand-sub">CANVAS LAB</span></span></a>
      <div class="nav-caption">交互实验</div>
      <nav aria-label="Demo 页面">
        <a href="#/bindings" data-page="bindings"><span class="nav-icon">↗</span>Canvas 重绘</a>
        <a href="#/lifecycle" data-page="lifecycle"><span class="nav-icon">◉</span>挂载与销毁</a>
        <a href="#/cache" data-page="cache"><span class="nav-icon">▦</span>区域缓存</a>
      </nav>
      <div class="sidebar-note"><span class="status-dot"></span> @einfach-excel/canvas<div>只绘制 Canvas cell</div></div>
    </aside>
    <main class="main">
      <header class="page-header"><div><div class="eyebrow">EINFACH / CANVAS DEMOS</div><h1></h1><p class="page-subtitle"></p></div><span class="runtime-tag">Canvas 2D</span></header>
      <div id="demo-content"></div>
      <footer>所有数字来自当前页面的实际运行。切换页面时，释放当前页面的资源。</footer>
    </main>
  </div>`)
  const host = find(shell, '#demo-content')
  let disposePage: (() => void) | undefined
  function navigate() {
    const requested = location.hash.slice(2)
    const name: PageName = Object.prototype.hasOwnProperty.call(pages, requested)
      ? requested as PageName : 'bindings'
    if (requested !== name) history.replaceState(null, '', `#/${name}`)
    disposePage?.()
    const page = pages[name]
    find(shell, 'h1').textContent = page.title
    find(shell, '.page-subtitle').textContent = page.subtitle
    document.title = `${page.title} · Einfach Canvas`
    for (const link of shell.querySelectorAll<HTMLAnchorElement>('nav a')) {
      if (link.dataset.page === name) link.setAttribute('aria-current', 'page')
      else link.removeAttribute('aria-current')
    }
    disposePage = createRoot(stop => {
      const content = page.create()
      host.replaceChildren(content)
      onCleanup(() => content.remove())
      return stop
    })
  }
  listen(window, 'hashchange', navigate)
  onCleanup(() => disposePage?.())
  navigate()
  return shell
}

const dispose = createRoot(stop => {
  const app = App()
  find(document, '#app').append(app)
  onCleanup(() => app.remove())
  return stop
})
if (import.meta.hot) import.meta.hot.dispose(dispose)
