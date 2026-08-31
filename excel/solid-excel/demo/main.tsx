
import { render } from 'solid-js/web'
import { App } from './App'
import { BenchRoot } from '../bench/BenchRoot'

const root = document.getElementById('app')
// `/?bench=1` 进入对外性能基准页（AD-505），其余一律走原 demo 壳。
const isBench = new URLSearchParams(window.location.search).get('bench') === '1'
if (root) {
  render(() => (isBench ? <BenchRoot /> : <App />), root)
}
