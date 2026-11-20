/** 浏览器输出边界再次限协议；不能因旧文件或畸形投影把脚本地址交给 DOM。 */
export function externalHyperlink(input: string | undefined): string | null {
  if (!input || input.length > 8192 || [...input].some((c) =>
    c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || c === '\\')) return null
  try {
    const url = new URL(input)
    return url.href.length <= 8192 && (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname && !url.username && !url.password ? url.href : null
  } catch { return null }
}

/** 工作簿内部跳转锚点必须以 `#` 开头且不含控制字符，绝不作为外部 URL 打开。 */
export function internalHyperlink(input: string | undefined): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed.startsWith('#') || trimmed.length < 2 || trimmed.length > 8192) return null
  if ([...trimmed].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return null
  return trimmed.slice(1).trim().length > 0 ? trimmed : null
}

export function safeHyperlink(input: string | undefined): string | null {
  return externalHyperlink(input) ?? internalHyperlink(input)
}
