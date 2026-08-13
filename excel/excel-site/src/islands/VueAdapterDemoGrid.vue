<script setup lang="ts">
import type { CellCoord } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetGridView, useSpreadsheetSelection } from '@einfach/vue-excel'
import { useSpreadsheetPointerSelection } from '@einfach/vue-excel/pointer-selection'
import { vueDemoCells, vueDemoRange, vueDemoSheetId } from './vue-adapter-demo-projection'
import './vue-adapter-demo.css'

interface Props {
  locale: 'en' | 'zh'
}

defineProps<Props>()

const selection = useSpreadsheetSelection()
const pointer = useSpreadsheetPointerSelection()

function coordinateFromEvent(event: PointerEvent): CellCoord | null {
  const target = event.target
  if (!(target instanceof Element)) return null
  const cell = target.closest<HTMLTableCellElement>('[data-row][data-col]')
  if (!cell) return null
  const row = Number(cell.dataset.row)
  const col = Number(cell.dataset.col)
  return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null
}

function onPointerDown(event: PointerEvent): void {
  const coord = coordinateFromEvent(event)
  if (coord) pointer.onPointerDown(event, { sheetId: vueDemoSheetId, coord })
}

function onPointerMove(event: PointerEvent): void {
  const coord = coordinateFromEvent(event)
  if (coord) pointer.onPointerMove(event, coord)
}

function formatSelection(): string {
  const { colEnd, colStart, rowEnd, rowStart } = selection.value.range
  return `${rowStart}:${colStart}..${rowEnd}:${colEnd}`
}
</script>

<template>
  <section class="demo-island vue-adapter-demo" data-runtime="static">
    <aside class="demo-runtime-note" :aria-label="locale === 'zh' ? '演示运行时' : 'Demo runtime'">
      <strong>{{ locale === 'zh' ? '受控本地投影' : 'Controlled local projection' }}</strong>
      <span>
        {{
          locale === 'zh'
            ? '调用方提供固定网格、确定性 backend 和隔离的 Einfach store。'
            : 'The caller supplies fixed cells, a deterministic backend, and an isolated Einfach store.'
        }}
      </span>
    </aside>
    <p class="vue-adapter-demo-instruction">
      {{ locale === 'zh' ? '在单元格间拖动以选择范围。' : 'Drag across cells to select a range.' }}
    </p>
    <div
      :aria-label="locale === 'zh' ? 'Vue 受控电子表格网格' : 'Vue controlled spreadsheet grid'"
      class="vue-adapter-demo-grid"
      data-testid="vue-controlled-grid"
      @pointercancel="pointer.onPointerCancel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="pointer.onPointerUp"
    >
      <SpreadsheetGridView
        :cells="vueDemoCells"
        :range="vueDemoRange"
        :selected="selection.range"
      />
    </div>
    <p class="vue-adapter-demo-selection">
      {{ locale === 'zh' ? '当前选择：' : 'Current selection:' }}
      <output data-testid="selection-range">{{ formatSelection() }}</output>
    </p>
  </section>
</template>
