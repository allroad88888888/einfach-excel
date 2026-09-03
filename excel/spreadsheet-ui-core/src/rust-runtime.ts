/// <reference lib="WebWorker" />

import * as wasm from '@einfach/excel-wasm'
import { installRustWorkbookRuntime } from './rust-workbook/runtime'

installRustWorkbookRuntime(wasm)
