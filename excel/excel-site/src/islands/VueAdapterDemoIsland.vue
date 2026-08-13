<script setup lang="ts">
import { SpreadsheetUiProvider } from '@einfach/vue-excel'
import VueAdapterDemoGrid from './VueAdapterDemoGrid.vue'
import { vueDemoBackend, vueDemoStore } from './vue-adapter-demo-projection'

interface Props {
  locale: 'en' | 'zh'
}

defineProps<Props>()
</script>

<template>
  <SpreadsheetUiProvider :backend="vueDemoBackend" :store="vueDemoStore">
    <VueAdapterDemoGrid :locale="locale" />
  </SpreadsheetUiProvider>
</template>
