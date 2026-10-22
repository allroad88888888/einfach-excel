import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const manifest = JSON.parse(await readFile(path.join(root,
  '.codex-artifacts/react-excel-package-004/consumers.json'), 'utf8'))
const port = Number(process.env.REACT_EXCEL_PACKAGE_PORT ?? 5193)
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.wasm': 'application/wasm', '.json': 'application/json' }
createServer(async (request, response) => {
  try {
    const [bundler, ...segments] = new URL(request.url, 'http://localhost').pathname.split('/').filter(Boolean)
    const directory = manifest.consumers[bundler]?.dist
    if (!directory || segments.includes('..')) throw new Error('Unknown consumer')
    const filename = path.join(directory, segments.join('/') || 'index.html')
    response.setHeader('Content-Type', types[path.extname(filename)] ?? 'application/octet-stream')
    response.end(await readFile(filename))
  } catch { response.statusCode = 404; response.end('Not found') }
}).listen(port, '127.0.0.1', () => console.log(`Packed consumers: http://127.0.0.1:${port}/{vite,rspack}/`))
