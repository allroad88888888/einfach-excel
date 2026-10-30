import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeSheetZoomAtom,
  MAX_SHEET_ZOOM,
  MIN_SHEET_ZOOM,
  SHEET_ZOOM_STEP,
  setSheetZoomAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { useLingui } from '@lingui/react/macro'
import './zoom.css'

/** 状态栏缩放：−/＋ 按 10% 步进，滑块直接设定，点百分比恢复 100%。 */
export function ZoomControl() {
  const { t } = useLingui()
  const zoom = useAtomValue(activeSheetZoomAtom)
  const setZoom = useSetAtom(setSheetZoomAtom)

  return (
    <div className="zoom-control" role="group" aria-label={t`Zoom`}>
      <button type="button" aria-label={t`Zoom out`} disabled={zoom <= MIN_SHEET_ZOOM}
        onClick={() => setZoom({ kind: 'step', direction: -1 })}>
        −
      </button>
      <input className="zoom-slider" type="range" aria-label={t`Zoom level`}
        min={MIN_SHEET_ZOOM} max={MAX_SHEET_ZOOM} step={SHEET_ZOOM_STEP} value={zoom}
        onChange={(event) => setZoom({ kind: 'set', percent: Number(event.currentTarget.value) })} />
      <button type="button" aria-label={t`Zoom in`} disabled={zoom >= MAX_SHEET_ZOOM}
        onClick={() => setZoom({ kind: 'step', direction: 1 })}>
        ＋
      </button>
      <button type="button" className="zoom-percent" title={t`Reset zoom to 100%`}
        aria-label={t`Zoom ${zoom} percent, reset to 100%`}
        onClick={() => setZoom({ kind: 'reset' })}>
        {zoom}%
      </button>
    </div>
  )
}
