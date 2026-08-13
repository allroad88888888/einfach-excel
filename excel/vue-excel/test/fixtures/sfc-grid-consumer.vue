<script setup lang="ts">
import { SpreadsheetGridView } from '@einfach/vue-excel'

const cells = [{ row: 1, col: 1, displayValue: 'A1' }]
const range = { rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1 }
</script>

<template>
  <SpreadsheetGridView :cells="cells" :range="range" />
</template>
