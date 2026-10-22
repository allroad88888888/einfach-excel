import { execFileSync } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const manifest = path.join(root, 'excel/rust/wasm/Cargo.toml')
const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--locked', '--format-version', '1',
  '--manifest-path', manifest, '--filter-platform', 'wasm32-unknown-unknown'], { encoding: 'utf8' }))
const tree = execFileSync('cargo', ['tree', '--locked', '--manifest-path', manifest,
  '--target', 'wasm32-unknown-unknown', '--edges', 'normal', '--prefix', 'none', '--format', '{p}'],
{ encoding: 'utf8' })
const shipped = new Set(tree.split('\n').map(line => line.replace(/ \(.*$/, '').replace(/ \(\*\)$/, '')))
let notice = 'Third-party notices for the bundled Rust/WASM Worker\n\n'
for (const pkg of metadata.packages.sort((a, b) => a.name.localeCompare(b.name))) {
  if (!pkg.source || !shipped.has(`${pkg.name} v${pkg.version}`)) continue
  let directory = path.dirname(pkg.manifest_path)
  let files = (await readdir(directory)).filter(file => /^(?:licen[sc]e|copying|notice)/i.test(file))
  // 某些宏子包漏带正文；只复用同一上游仓库、同一许可证的真实发布文本。
  if (!files.length) for (const sibling of metadata.packages) {
    if (sibling.id === pkg.id || sibling.repository !== pkg.repository) continue
    const candidate = path.dirname(sibling.manifest_path)
    const licenses = (await readdir(candidate)).filter(file => /^(?:licen[sc]e|copying|notice)/i.test(file))
    const sameLicense = sibling.license === pkg.license || (pkg.license === 'Apache-2.0' &&
      (await Promise.all(licenses.map(file => readFile(path.join(candidate, file), 'utf8'))))
        .some(text => /Apache License\s+Version 2\.0/.test(text)))
    if (licenses.length && sameLicense) { directory = candidate; files = licenses; break }
  }
  if (!files.length) throw new Error(`Missing third-party license text: ${pkg.name}`)
  notice += `\n${'='.repeat(72)}\n${pkg.name} ${pkg.version}\nLicense: ${pkg.license ?? ''}\n`
  notice += `Source: ${pkg.repository ?? pkg.homepage ?? `https://crates.io/crates/${pkg.name}`}\n`
  for (const file of files.sort()) {
    try { notice += `\n--- ${file} ---\n${await readFile(path.join(directory, file), 'utf8')}\n` }
    catch (error) { if (error.code !== 'EISDIR') throw error }
  }
}
// 通知随实际发行物生成；不会让消费者安装 Cargo 或运行生成脚本。
await writeFile(path.join(root, 'excel/react-excel/dist/THIRD_PARTY_NOTICES.txt'), notice)
console.log(`Bundled Worker notices: ${notice.length} characters`)
