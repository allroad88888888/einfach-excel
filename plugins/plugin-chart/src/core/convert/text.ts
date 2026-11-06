export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!)
}

/** 提示框里的派生数值（累计、分位数、分箱边界）：去掉浮点噪声，不带千分位。 */
export function formatNumber(value: number, digits = 6): string {
  return Number.isFinite(value) ? String(Number(value.toPrecision(digits))) : ''
}
