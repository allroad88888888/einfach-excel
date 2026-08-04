#!/usr/bin/env node
// 剥掉 wasm 产物里只对调试有用的 custom section（`name` 与 `.debug_*`）。
// 零依赖、就地改写、可重复执行（已剥过的文件再跑一次是 no-op）。
//
// 为什么需要它：wasm-pack 的 release 流水线本来靠 wasm-opt 顺手删掉 name section，
// 而本仓在 excel/rust/wasm/Cargo.toml 里关掉了 wasm-opt（它要在构建时从 GitHub 下 binaryen，
// 受限网络下必崩）。代价是 572 KB 的函数名符号表被原样发给浏览器 —— 占 3.1 MB 产物的 18%，
// 是单项最大的浪费。实测 3,172,516 → 2,601,536 字节（gzip 969,758 → 833,045）。
//
// 挂在 excel/solid-excel 的 `build:wasm`（lite，剥 `wasm-pkg/`）与 `build:wasm:full`
// （full，剥 `wasm-pkg-full/`）末尾，所以 dev 与 jest 默认拿到的是**已剥**的产物。
// 需要可读 panic 栈时跑 `build:wasm:keep-names` / `build:wasm:full:keep-names`
// —— 那两条只跑 wasm-pack，不接这一步。
//
// 用法：node scripts/strip-wasm-names.mjs <file.wasm> [...]

import { readFileSync, renameSync, writeFileSync } from 'node:fs'

const DROP = (name) => name === 'name' || name.startsWith('.debug')

// LEB128 无符号整数：wasm 里所有长度/索引都是这个编码
function uleb(buf, at) {
  let value = 0
  let shift = 0
  let pos = at
  for (;;) {
    if (pos >= buf.length) throw new Error(`LEB128 在偏移 ${at} 处越界`)
    const byte = buf[pos++]
    value += (byte & 0x7f) * 2 ** shift
    if ((byte & 0x80) === 0) return [value, pos]
    shift += 7
    if (shift > 35) throw new Error(`LEB128 在偏移 ${at} 处过长`)
  }
}

// 返回剥完的 buffer 与被丢掉的 section 清单
function strip(buf) {
  if (buf.length < 8 || buf.readUInt32LE(0) !== 0x6d736100) {
    throw new Error('不是 wasm 二进制（magic 不是 \\0asm）')
  }
  const keep = [buf.subarray(0, 8)] // magic + version
  const dropped = []
  let pos = 8

  while (pos < buf.length) {
    const start = pos
    const id = buf[pos++]
    const [size, afterSize] = uleb(buf, pos)
    const body = afterSize
    const end = body + size
    if (end > buf.length) throw new Error(`section（id=${id}）声明的长度超出文件`)
    pos = end

    if (id === 0) {
      const [nameLen, afterLen] = uleb(buf, body)
      const name = buf.subarray(afterLen, afterLen + nameLen).toString('utf8')
      if (DROP(name)) {
        dropped.push({ name, bytes: end - start })
        continue
      }
    }
    keep.push(buf.subarray(start, end))
  }

  return { out: Buffer.concat(keep), dropped }
}

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('用法：node scripts/strip-wasm-names.mjs <file.wasm> [...]')
  process.exit(1)
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`

for (const file of files) {
  const before = readFileSync(file)
  const { out, dropped } = strip(before)

  if (dropped.length === 0) {
    console.log(`· ${file}：无可剥的 section（${kb(before.length)}）`)
    continue
  }

  // 先写临时文件再 rename：构建中途被打断也不会留下半个 wasm
  const tmp = `${file}.stripping`
  writeFileSync(tmp, out)
  renameSync(tmp, file)

  const saved = before.length - out.length
  const what = dropped.map((d) => `${d.name} ${kb(d.bytes)}`).join('、')
  console.log(
    `✂ ${file}：${kb(before.length)} → ${kb(out.length)}` +
      `（-${kb(saved)}，${((saved / before.length) * 100).toFixed(1)}%；剥掉 ${what}）`,
  )
}
