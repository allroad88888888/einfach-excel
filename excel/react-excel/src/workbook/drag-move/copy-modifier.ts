interface ModifierState {
  readonly altKey: boolean
  readonly ctrlKey: boolean
}

function applePlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
  return /Mac|iPhone|iPad/i.test(data?.platform || navigator.platform || '')
}

/** Excel 约定：Windows/Linux 按住 Ctrl、Mac 按住 Option 拖动边框时复制而不是移动。 */
export function isDragCopyModifier(event: ModifierState): boolean {
  return applePlatform() ? event.altKey : event.ctrlKey
}

/** 只有这个键按下／抬起时才需要刷新拖动中的复制标记。 */
export function dragCopyModifierKey(): 'Alt' | 'Control' {
  return applePlatform() ? 'Alt' : 'Control'
}
