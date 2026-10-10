/** 等待写入时 disabled 会移走焦点；不抢走用户主动移到别处的焦点。 */
export async function preserveToolFocus(control: HTMLElement, action: () => Promise<unknown>) {
  const hadFocus = document.activeElement === control
  await action()
  requestAnimationFrame(() => {
    if (hadFocus && control.isConnected && !control.matches(':disabled') &&
      document.activeElement === document.body) control.focus({ preventScroll: true })
  })
}
