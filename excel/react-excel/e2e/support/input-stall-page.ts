/** 只在诊断 fixture 启用：页面自身时钟不依赖 Node RPC 到达时间。 */
export function installInputStallProbe() {
  if (window !== window.top) return
  const diagnostic = window as typeof window & {
    __inputStallFlush?: () => Promise<void>
    __inputStallDeliver: (batch: unknown) => Promise<void>
  }
  const capacity = 128
  const records: object[] = []
  let dropped = 0, sequence = 0, pending = false
  let lastBeat = performance.now(), maxBeatGap = 0
  const target = (node: EventTarget | null) => {
    const element = node instanceof Element ? node : document.activeElement
    // 不采集单元格值、输入文本、剪贴板或 URL 查询参数。
    return element ? {
      tag: element.tagName, role: element.getAttribute('role'),
      label: element.getAttribute('aria-label'), id: element.id,
    } : null
  }
  const record = (kind: string, facts: object = {}) => {
    if (records.length === capacity) { records.shift(); dropped++ }
    records.push({ kind, pageMs: performance.now(), sequence: sequence++, ...facts })
  }
  const flush = async () => {
    if (pending) return
    pending = true
    const batch = records.splice(0)
    try {
      await diagnostic.__inputStallDeliver({
        timeOrigin: performance.timeOrigin, pageMs: performance.now(),
        maxBeatGap, dropped, records: batch,
      })
    } catch {
      // 断连不累积 RPC；保留缺失计数，下一次成功批次再报告。
      dropped += batch.length
    } finally { pending = false }
  }
  diagnostic.__inputStallFlush = flush
  record('installed')
  setInterval(() => {
    const now = performance.now(), gap = now - lastBeat
    lastBeat = now
    maxBeatGap = Math.max(maxBeatGap, gap)
    record('heartbeat', {
      gap, active: target(null), visibility: document.visibilityState,
      hasFocus: document.hasFocus(),
    })
  }, 250)
  // 页面批次最多一个在途；Node 恢复后读取浏览器原始时间而非猜测阻塞来源。
  setInterval(() => { void flush() }, 1000)
  for (const kind of ['focusin', 'focusout', 'input', 'keydown', 'selectionchange'])
    document.addEventListener(kind, event => record(kind, {
      target: target(event.target),
      key: event instanceof KeyboardEvent &&
        ['Enter', 'Tab', 'Escape'].includes(event.key) ? event.key : undefined,
    }), { capture: true, passive: true })
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries())
        record('longtask', { start: entry.startTime, duration: entry.duration })
    }).observe({ type: 'longtask', buffered: true })
  } catch (error) { record('longtask-unavailable', { error: String(error) }) }
}
