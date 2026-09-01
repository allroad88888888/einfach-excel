export interface FormulaBarProps {
  readonly address: string
  readonly value: string
}

/** Shows the active range address and active-cell value. */
export function FormulaBar({ address, value }: FormulaBarProps) {
  return (
    <div className="formula-bar">
      <output className="name-box" aria-label="Selected range">{address}</output>
      <span className="formula-divider" aria-hidden="true" />
      <span className="insert-function" aria-hidden="true">fx</span>
      <output className="formula-value" aria-label="Active cell value">{value}</output>
    </div>
  )
}
