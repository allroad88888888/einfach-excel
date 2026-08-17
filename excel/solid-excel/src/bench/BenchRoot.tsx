// 一句话：`/?bench=1` 的入口路由 —— 按 embed 参数在页面壳与首屏被测页之间二选一。

import { Show } from 'solid-js'
import { BenchApp } from './BenchApp'
import { BenchEmbed } from './BenchEmbed'
import { FIRST_SCREEN_EMBED_PARAM } from './scenario-first-screen'
import '../styles.css'
import '@einfach/spreadsheet-ui-styles/styles.css'

function isFirstScreenEmbed(): boolean {
  return new URLSearchParams(window.location.search).get('embed') === FIRST_SCREEN_EMBED_PARAM
}

export function BenchRoot() {
  return (
    <Show when={!isFirstScreenEmbed()} fallback={<BenchEmbed />}>
      <BenchApp />
    </Show>
  )
}
