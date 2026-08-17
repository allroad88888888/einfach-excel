// 一句话：AD-828 演示的零依赖 HTTP 后端服务 —— 三个必需端口的 JSON 端点与响应字节计量。
//
// 用法：node excel/solid-excel/demo-remote/server.mjs   （端口取 AD828_PORT，默认 5303）
//
// 端点与 `SpreadsheetBackend` 三必需方法一一对应（契约见
// excel/spreadsheet-ui-core/src/backend/types.ts）：
//   POST /api/read-visible-projection  → readVisibleProjection
//   POST /api/read-range-projection    → readRangeProjection
//   POST /api/set-cell-input           → setCellInput
//   GET  /api/stats                    → 服务端计量（请求数 / 响应体字节 / 工作簿口径）
//
// 每个响应都带 `x-einfach-response-bytes` 头（响应体 UTF-8 字节数），同时累计进
// /api/stats。这是演示服务：无鉴权、无持久化、无并发或生产承诺。

import http from 'node:http'
import { createRemoteWorkbook } from './workbook.mjs'

const PORT = Number(process.env.AD828_PORT ?? 5303)
const MAX_BODY_BYTES = 1024 * 1024

const workbook = createRemoteWorkbook()

/** 只计三必需端点；/api/stats 自身不进计量。 */
const endpointStats = {
  'read-visible-projection': { requests: 0, responseBytes: 0 },
  'read-range-projection': { requests: 0, responseBytes: 0 },
  'set-cell-input': { requests: 0, responseBytes: 0 },
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-expose-headers': 'x-einfach-response-bytes',
}

function respondJson(res, status, payload, endpointKey) {
  const body = JSON.stringify(payload)
  const bytes = Buffer.byteLength(body, 'utf8')
  if (endpointKey) {
    endpointStats[endpointKey].requests += 1
    endpointStats[endpointKey].responseBytes += bytes
  }
  res.writeHead(status, {
    ...CORS_HEADERS,
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(bytes),
    'x-einfach-response-bytes': String(bytes),
  })
  res.end(body)
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let received = 0
    req.on('data', (chunk) => {
      received += chunk.length
      if (received > MAX_BODY_BYTES) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('request body is not valid JSON'))
      }
    })
    req.on('error', reject)
  })
}

function handleProjection(request, kind, endpointKey, res) {
  const window = kind === 'visible-window' ? request.window : request.range
  if (!window || typeof window !== 'object') {
    respondJson(res, 400, { error: 'missing window/range' }, endpointKey)
    return
  }
  const { cells, truncated } = workbook.readCells(window)
  const result = {
    kind,
    sheetId: request.sheetId ?? workbook.sheetId,
    requestId: request.requestId,
    revision: workbook.getRevision(),
    cells,
    ...(kind === 'visible-window' ? { window } : { range: window }),
    ...(truncated ? { truncated: true } : {}),
  }
  respondJson(res, 200, result, endpointKey)
}

function handleSetCellInput(request, res) {
  const outcome = workbook.setCellInput(request.row, request.col, request.input)
  if (!outcome.ok) {
    respondJson(res, 422, { error: outcome.message }, 'set-cell-input')
    return
  }
  respondJson(res, 200, {
    sheetId: request.sheetId ?? workbook.sheetId,
    requestId: request.requestId,
    revision: outcome.revision,
    affectedRange: {
      rowStart: request.row,
      rowEnd: request.row,
      colStart: request.col,
      colEnd: request.col,
    },
  }, 'set-cell-input')
}

function handleStats(res) {
  const totals = Object.values(endpointStats).reduce(
    (acc, entry) => ({
      requests: acc.requests + entry.requests,
      responseBytes: acc.responseBytes + entry.responseBytes,
    }),
    { requests: 0, responseBytes: 0 },
  )
  respondJson(res, 200, {
    workbook: {
      sheetId: workbook.sheetId,
      rowCount: workbook.rowCount,
      colCount: workbook.colCount,
      populatedCellCount: workbook.populatedCellCount,
      fullWorkbookCellsJsonBytes: workbook.measureFullWorkbookCellsJsonBytes(),
      revision: workbook.getRevision(),
    },
    endpoints: endpointStats,
    totals,
  })
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
  const route = `${req.method} ${url.pathname}`

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    res.end()
    return
  }
  if (route === 'GET /api/stats') {
    handleStats(res)
    return
  }
  if (route.startsWith('POST /api/')) {
    readJsonBody(req)
      .then((body) => {
        if (url.pathname === '/api/read-visible-projection') {
          handleProjection(body, 'visible-window', 'read-visible-projection', res)
        } else if (url.pathname === '/api/read-range-projection') {
          handleProjection(body, 'range', 'read-range-projection', res)
        } else if (url.pathname === '/api/set-cell-input') {
          handleSetCellInput(body, res)
        } else {
          respondJson(res, 404, { error: `unknown endpoint ${url.pathname}` })
        }
      })
      .catch((error) => {
        respondJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      })
    return
  }
  respondJson(res, 404, { error: `unknown route ${route}` })
})

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(
    `AD-828 demo remote backend listening on http://127.0.0.1:${PORT} ` +
      `(${workbook.rowCount}x${workbook.colCount} in-memory workbook)\n`,
  )
})
