import type { Store } from '@einfach/core'
import {
  createSpreadsheetUi,
  type SpreadsheetBackend,
  type SpreadsheetUiCore,
} from '@einfach/spreadsheet-ui-core'
import { computed, defineComponent, provide, type PropType } from 'vue'
import { SpreadsheetUiContext } from './spreadsheet-ui-context'

export interface SpreadsheetUiProviderProps {
  backend: SpreadsheetBackend
  store?: Store
}

function createCore(backend: SpreadsheetBackend, store: Store | undefined): SpreadsheetUiCore {
  return createSpreadsheetUi({ backend, store })
}

/** Supplies an isolated spreadsheet core to a Vue subtree. */
export const SpreadsheetUiProvider = defineComponent({
  name: 'SpreadsheetUiProvider',
  props: {
    backend: { type: Object as PropType<SpreadsheetBackend>, required: true },
    store: { type: Object as PropType<Store>, required: false },
  },
  setup(props, { slots }) {
    const core = computed(() => createCore(props.backend, props.store))
    provide(SpreadsheetUiContext, core)

    return () => slots.default?.()
  },
})
