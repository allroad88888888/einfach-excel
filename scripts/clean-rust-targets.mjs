// 清理各 Rust crate 的本机 debug 构建缓存（cargo 不会自行回收 target/ 里的旧测试二进制）。
// 只删 target/debug；保留 release 与 wasm32-unknown-unknown，build:wasm 仍可增量构建。
//
//   node scripts/clean-rust-targets.mjs              无条件清理
//   node scripts/clean-rust-targets.mjs --if-over 20 debug 合计超过 20 GiB 才清理（post-commit 用）
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
const crates = ['core', 'excel-core', 'wasm']
const debugDirs = crates
  .map(crate => path.join(root, 'excel/rust', crate, 'target/debug'))
  .filter(dir => existsSync(dir))

const flag = process.argv.indexOf('--if-over')
const thresholdGiB = flag === -1 ? 0 : Number(process.argv[flag + 1])
if (Number.isNaN(thresholdGiB)) throw new Error('--if-over needs a number of GiB')

// du 比逐文件 stat 快得多：debug/deps 可以有几十万个文件。
const sizeKiB = dir => Number(spawnSync('du', ['-sk', dir], { encoding: 'utf8' }).stdout.split('\t')[0]) || 0
const totalGiB = debugDirs.reduce((sum, dir) => sum + sizeKiB(dir), 0) / 1024 / 1024

if (totalGiB <= thresholdGiB) process.exit(0)
for (const dir of debugDirs) rmSync(dir, { recursive: true, force: true })
process.stdout.write(`clean-rust-targets: removed ${totalGiB.toFixed(1)} GiB of Rust debug caches\n`)
