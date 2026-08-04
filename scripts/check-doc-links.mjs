#!/usr/bin/env node
// 文档链接与失效路径检查。零依赖，本地和 CI 跑同一份。
//
// 检查两件事：
//   1. 活文档里的相对链接是否指向真实存在的文件。
//   2. 活文档里是否出现了已知的失效路径形态（拆仓与 e2e 重组留下的坑）。
//
// 归档区（archive/）豁免：冻结记录里的死链是史实的一部分，改了就不是原件了。
//
// 用法：node scripts/check-doc-links.mjs

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, normalize, join } from 'node:path'

const EXEMPT = [
  '/archive/', // 冻结记录
  'wasm-pkg/', // wasm-pack 生成物
  'perf-reports/', // bench 生成物
  'node_modules/',
  '.changeset/',
]

// 已知失效路径形态 —— 每条都对应一次真实发生过的迁移
const STALE_PATTERNS = [
  {
    re: /\bcore\/(core|solid|react|react-form|react-utils|solid-form|utils)\//g,
    why: '`core/*` 已随拆仓迁出本仓，上游走 npm（见 docs/decisions/0002）',
  },
  {
    re: /\bexcel\/showcase\b/g,
    why: '`excel/showcase` 已退役，由 `excel/excel-site` 接任',
  },
  {
    // 平铺时代的 e2e 路径：e2e/<name>.spec.ts（现在一律在功能目录下）
    re: /\be2e\/[a-z0-9-]+\.spec\.ts\b/g,
    why: 'e2e 已按功能点分目录，路径形如 `e2e/<feature>/<name>.spec.ts`（见 docs/decisions/0005）',
  },
  {
    re: /\/Volumes\/work\/self\/einfach\b/g,
    why: '拆仓前老仓的绝对路径，在本仓不可用',
  },
]

const LINK = /\[[^\]]*\]\(([^)\s]+?)(?:#[^)]*)?\)/g

// 讲迁移本身的文档（提案、ADR、迁移说明）需要引用旧路径作为「被替换掉的东西」。
// 在文件任意位置写下这行标记即可豁免失效路径检查（死链检查仍然生效）。
// markdown 写 `<!-- doc-check: allow-stale-paths -->`，源码写 `// doc-check: allow-stale-paths`
const STALE_OPT_OUT = 'doc-check: allow-stale-paths'

const ls = (...globs) =>
  execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', ...globs], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    .filter((f) => existsSync(f))
    .filter((f) => !EXEMPT.some((e) => f.includes(e)))

// 链接检查只对 markdown；失效路径检查连源码注释一起查 —— 上一轮
// 就是源码注释里的 6 处悬空引用逃过了纯 markdown 的检查。
const docs = ls('*.md')
const sources = ls('*.ts', '*.tsx', '*.rs', '*.yml', '*.mjs', '*.cjs')
const tracked = [...new Set([...docs, ...sources])]

const brokenLinks = []
const stalePaths = []

for (const file of tracked) {
  const text = readFileSync(file, 'utf8')
  const base = dirname(file)

  if (file.endsWith('.md')) for (const m of text.matchAll(LINK)) {
    const target = m[1]
    // 纯页内锚点，以及被误当成链接的内容（如数字格式串 `[Red](#,##0.00)`）
    if (target.startsWith('#')) continue
    if (/^(https?:|mailto:|tel:)/.test(target)) continue
    if (!existsSync(normalize(join(base, target)))) {
      brokenLinks.push({ file, target })
    }
  }

  if (text.includes(STALE_OPT_OUT)) continue
  if (file === 'scripts/check-doc-links.mjs') continue // 自身定义这些模式

  for (const { re, why } of STALE_PATTERNS) {
    for (const m of text.matchAll(re)) {
      // 写成 archive/ 路径的引用是刻意指向历史记录，放过
      if (text.slice(Math.max(0, m.index - 40), m.index).includes('archive/')) continue
      const line = text.slice(0, m.index).split('\n').length
      stalePaths.push({ file, line, hit: m[0], why })
    }
  }
}

let failed = false

if (brokenLinks.length > 0) {
  failed = true
  console.error(`\n❌ 死链 ${brokenLinks.length} 条：`)
  for (const { file, target } of brokenLinks) console.error(`   ${file} → ${target}`)
}

if (stalePaths.length > 0) {
  failed = true
  console.error(`\n❌ 失效路径 ${stalePaths.length} 处：`)
  for (const { file, line, hit, why } of stalePaths) {
    console.error(`   ${file}:${line}  ${hit}`)
    console.error(`      ↳ ${why}`)
  }
}

if (failed) {
  console.error(
    '\n归档区（archive/）已豁免。若这条引用确实是指向历史记录，' +
      '把它写成 `archive/...` 路径或在附近注明「已归档」。\n',
  )
  process.exit(1)
}

console.log(
  `✅ ${docs.length} 份活文档零死链；${tracked.length} 份文件（含源码注释）无失效路径`,
)
