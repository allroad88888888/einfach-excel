/** 与 Excel 下拉一致：编辑器里按 Alt+↓ 把焦点移进日历，Tab 仍按编辑器原有语义提交。 */
export const DATE_PICKER_SHORTCUT = 'Alt+ArrowDown'

/**
 * 在编辑器容器上监听快捷键。用原生监听并阻止冒泡，编辑器自己的按键处理不会再把它当作移动选区。
 * 返回解绑函数。
 */
export function bindDatePickerShortcut(editor: HTMLElement, input: HTMLInputElement): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (!event.altKey || event.key !== 'ArrowDown' || event.isComposing) return
    if (input.disabled || event.target === input) return
    event.preventDefault()
    event.stopPropagation()
    input.focus({ preventScroll: true })
    try { input.showPicker?.() } catch {
      // 部分浏览器只允许在点击里打开原生日历；焦点已到位，键盘仍可直接输入日期。
    }
  }
  editor.addEventListener('keydown', onKeyDown)
  return () => editor.removeEventListener('keydown', onKeyDown)
}
