/** 功能区通用的图标按钮：稳定 ID、可访问名称与按下状态。 */
export interface ToolButtonProps {
  readonly itemId: string
  readonly icon: string
  readonly label: string
  readonly onClick?: () => void
  readonly pressed?: boolean
  readonly disabled?: boolean
}

export function ToolButton({ itemId, icon, label, onClick, pressed, disabled }: ToolButtonProps) {
  return (
    <button
      data-ribbon-item={itemId}
      aria-label={label}
      aria-pressed={pressed}
      className="tool-button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  )
}
