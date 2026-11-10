// 按历史耗时把 React e2e 的 spec 文件分给 CI 分片，替代 Playwright 按用例条数连续切分的 --shard。
// 各 runner 输入相同（耗时表 + 排序后的文件列表）且平局规则固定，所以各自算出同一份分配。
//
//   node scripts/e2e-shard-plan.mjs 3/8      输出第 3 片的文件过滤参数（空格分隔）
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const e2eDir = fileURLToPath(new URL('../excel/react-excel/e2e/', import.meta.url))
const timingsPath = path.join(e2eDir, 'shard-timings.json')

/**
 * 最长耗时优先（LPT）：从最慢的文件开始，每次放进当前负载最小的分片。
 * 耗时表里没有的新文件按已知文件的中位数估算；表里已删除的文件自然忽略。
 */
export function planShards(files, timings, total) {
  const known = files.map((file) => timings[file]).filter((value) => typeof value === 'number')
    .sort((a, b) => a - b)
  const fallback = known.length ? known[Math.floor(known.length / 2)] : 1
  const estimate = (file) => (typeof timings[file] === 'number' ? timings[file] : fallback)
  const order = [...files].sort((a, b) => estimate(b) - estimate(a) || a.localeCompare(b))
  const shards = Array.from({ length: total }, () => ({ seconds: 0, files: [] }))
  for (const file of order) {
    const target = shards.reduce((best, shard) => (shard.seconds < best.seconds ? shard : best))
    target.seconds += estimate(file)
    target.files.push(file)
  }
  return shards.map((shard) => ({ seconds: shard.seconds, files: shard.files.sort() }))
}

export function listSpecFiles(directory = e2eDir) {
  return readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.spec.ts'))
    .map((file) => file.split(path.sep).join('/'))
    .sort()
}

/**
 * Playwright 把位置参数当正则匹配文件绝对路径。以 `e2e/` 开头的完整相对路径前后都有路径分隔，
 * 这里再核对每个过滤参数恰好命中一个文件，避免某个文件被重复或漏掉。
 */
export function toFileFilters(shardFiles, allFiles) {
  return shardFiles.map((file) => {
    const filter = `e2e/${file}`
    const pattern = new RegExp(filter, 'i')
    const hits = allFiles.filter((candidate) => pattern.test(`/excel/react-excel/e2e/${candidate}`))
    if (hits.length !== 1) throw new Error(`过滤参数 ${filter} 命中 ${hits.length} 个文件：${hits.join(', ')}`)
    return filter
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const match = /^(\d+)\/(\d+)$/.exec(process.argv[2] ?? '')
  const current = Number(match?.[1])
  const total = Number(match?.[2])
  if (!match || current < 1 || current > total) {
    console.error('用法：node scripts/e2e-shard-plan.mjs <current>/<total>，例如 3/8')
    process.exit(1)
  }
  const files = listSpecFiles()
  const shards = planShards(files, JSON.parse(readFileSync(timingsPath, 'utf8')), total)
  const mine = shards[current - 1]
  console.error(`分片 ${current}/${total}：${mine.files.length} 个文件，预计 ${Math.round(mine.seconds / 60)} 分钟`)
  process.stdout.write(`${toFileFilters(mine.files, files).join(' ')}\n`)
}
