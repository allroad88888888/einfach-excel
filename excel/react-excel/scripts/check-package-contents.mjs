import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const artifact = JSON.parse(await readFile(path.join(directory, 'dist/artifact-manifest.json'), 'utf8'))
const [packed] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
  cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}))
const files = packed.files.map((entry) => entry.path).sort()
for (const file of files) {
  const npmDocumentation = /^(?:readme|licen[sc]e|copying|notice)(?:\.[^/]*)?$/i.test(file)
  if (file !== 'package.json' && !npmDocumentation
    && !file.startsWith('dist/') && !file.startsWith('docs/package/')) {
    throw new Error(`Unexpected packed input: ${file}`)
  }
  if (/(?:^|\/)(?:test|e2e|dist-demo|src)(?:\/|$)/.test(file)) {
    throw new Error(`Source or demo leaked into package: ${file}`)
  }
}
for (const file of [...artifact.files, 'artifact-manifest.json']) {
  if (!files.includes(`dist/${file}`)) throw new Error(`Artifact not packed: ${file}`)
}
for (const required of ['LICENSE', 'NOTICE', 'dist/THIRD_PARTY_NOTICES.txt']) {
  if (!files.includes(required)) throw new Error(`Missing legal notice: ${required}`)
}
process.stdout.write(`${JSON.stringify({ filename: packed.filename, files, size: packed.size }, null, 2)}\n`)
