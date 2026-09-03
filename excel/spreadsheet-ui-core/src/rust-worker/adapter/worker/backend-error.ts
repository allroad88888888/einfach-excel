// 一句话：铸造带结构化 code 的适配器错误。

export function createBackendError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code })
}
