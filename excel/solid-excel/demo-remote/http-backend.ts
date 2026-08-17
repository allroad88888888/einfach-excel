// 一句话：SpreadsheetBackend 三必需方法的 HTTP fetch 适配器（AD-828 演示）。
//
// 刻意**只**实现契约的三个必需方法（`readVisibleProjection`、
// `readRangeProjection`、`setCellInput`）——其余可选端口全部缺席，UI core 按
// 方法在位性自动隐藏对应功能面。这正是演示要证明的：同一套 UI 隔着网络对端
// 也能浏览工作簿，端口契约不绑死 Web Worker。服务端实现见同目录 `server.mjs`。

import type {
  BackendMutationResult,
  RangeProjectionRequest,
  RangeProjectionResult,
  SetCellInputRequest,
  SpreadsheetBackend,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'

export interface HttpSpreadsheetBackendOptions {
  /** 形如 `http://127.0.0.1:5303`，结尾不带斜杠。 */
  baseUrl: string
}

async function postJson<T>(baseUrl: string, path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    let message = `remote backend ${path} failed with HTTP ${response.status}`
    try {
      const body = (await response.json()) as { error?: unknown }
      if (typeof body.error === 'string' && body.error.length > 0) message = body.error
    } catch {
      // keep the HTTP status message
    }
    throw new Error(message)
  }
  return (await response.json()) as T
}

/** 显式挑选过线字段：`cancelToken` 等宿主本地对象不属于 wire 契约。 */
function visibleWirePayload(request: VisibleProjectionRequest) {
  return {
    kind: request.kind,
    sheetId: request.sheetId,
    window: request.window,
    requestId: request.requestId,
    reason: request.reason,
    revision: request.revision,
  }
}

function rangeWirePayload(request: RangeProjectionRequest) {
  return {
    kind: request.kind,
    sheetId: request.sheetId,
    range: request.range,
    requestId: request.requestId,
    reason: request.reason,
    revision: request.revision,
  }
}

function setCellInputWirePayload(request: SetCellInputRequest) {
  return {
    kind: request.kind,
    sheetId: request.sheetId,
    row: request.row,
    col: request.col,
    input: request.input,
    requestId: request.requestId,
    revision: request.revision,
  }
}

export function createHttpSpreadsheetBackend(
  options: HttpSpreadsheetBackendOptions,
): SpreadsheetBackend {
  const baseUrl = options.baseUrl.replace(/\/+$/, '')
  return {
    readVisibleProjection(request: VisibleProjectionRequest): Promise<VisibleProjectionResult> {
      return postJson<VisibleProjectionResult>(
        baseUrl,
        '/api/read-visible-projection',
        visibleWirePayload(request),
      )
    },
    readRangeProjection(request: RangeProjectionRequest): Promise<RangeProjectionResult> {
      return postJson<RangeProjectionResult>(
        baseUrl,
        '/api/read-range-projection',
        rangeWirePayload(request),
      )
    },
    setCellInput(request: SetCellInputRequest): Promise<BackendMutationResult> {
      return postJson<BackendMutationResult>(
        baseUrl,
        '/api/set-cell-input',
        setCellInputWirePayload(request),
      )
    },
  }
}
