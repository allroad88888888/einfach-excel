import { createStore } from '@einfach/core'
import { useAtomValue } from '@einfach/react'
import { setViewportMetricsAtom, viewportMetricsAtom } from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { useWorkbookGridViewportMeasurement } from '../../../src/workbook/grid/viewport/use-workbook-grid-viewport-measurement'
import { workbookViewportMetrics } from '../../../src/workbook/grid/viewport/workbook-grid-config'

function ViewportMeasurementProbe() {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const metrics = useAtomValue(viewportMetricsAtom)
  useWorkbookGridViewportMeasurement(scrollRef)
  const captureScroll = (node: HTMLDivElement | null) => {
    if (node !== null) {
      Object.defineProperties(node, {
        clientHeight: { value: 700 },
        clientWidth: { value: 1_000 },
      })
    }
    scrollRef.current = node
  }
  return (
    <div ref={captureScroll}>
      <output aria-label="viewport size">
        {metrics.viewportWidth}×{metrics.viewportHeight}
      </output>
    </div>
  )
}

describe('workbook viewport measurement', () => {
  it('excludes the sticky headers from the scroll surface size', () => {
    const store = createStore()
    store.setter(setViewportMetricsAtom, workbookViewportMetrics(1001, 16))

    render(
      <WorkbookStoreProvider store={store}>
        <ViewportMeasurementProbe />
      </WorkbookStoreProvider>,
    )

    expect(screen.getByLabelText('viewport size')).toHaveTextContent('954×672')
    expect(store.getter(viewportMetricsAtom)).toMatchObject({
      viewportWidth: 954,
      viewportHeight: 672,
    })
  })
})
