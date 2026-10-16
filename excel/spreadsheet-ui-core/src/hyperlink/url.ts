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
