import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import { WORKBOOK_FILE_MAX_BYTES } from '../rust-workbook/file-commands'
import { replaceRustWorkbookRuntimeAtom } from './rust-workbook-runtime'
import { rustWorkbookConnectionAtom } from './workbook-connection'
import { workbookDocumentAtom } from './workbook-document'
import { workbookReplacementErrorAtom } from '../host/state'

interface WorkbookFilePanel {
  readonly open: boolean
  readonly busy: boolean
  readonly error: boolean
  readonly message: string
}
const stateAtom = atom<WorkbookFilePanel>({ open: false, busy: false, error: false, message: '' })

export const workbookFilePanelAtom = atom((get) => ({
  ...get(stateAtom),
  disabled: !get(rustWorkbookConnectionAtom) || get(editingSessionAtom).source !== null,
}))

type FileAction =
  | { readonly action: 'show' | 'close' }
  | { readonly action: 'new'; readonly confirmed: boolean }
  | { readonly action: 'open'; readonly confirmed: boolean; readonly size: number;
      readonly read: () => Promise<string> }
  | { readonly action: 'download'; readonly write: (file: {
      readonly text: string; readonly filename: string
    }) => Promise<void> }

/** 一次文件手势一个命令；浏览器只提供读文件／下载，工作簿内容不进入 UI atom。 */
export const runWorkbookFileAtom = atom(null, async (
  get, set, input: FileAction,
): Promise<boolean> => {
  const state = get(stateAtom)
  if (state.busy) return false
  if (input.action === 'close') {
    set(stateAtom, { ...state, open: false })
    return true
  }
  const connection = get(rustWorkbookConnectionAtom)
  if (!connection || get(editingSessionAtom).source) return false
  if (input.action === 'show') {
    set(stateAtom, { open: true, busy: false, error: false, message: '' })
    return true
  }
  if ((input.action === 'open' || input.action === 'new') && !input.confirmed) return false
  const pending = { ...state, busy: true, error: false,
    message: input.action === 'download' ? 'Preparing download…' : 'Opening workbook…' }
  set(stateAtom, pending)
  let replaced = false
  try {
    if (input.action === 'download') {
      const file = await connection.request('workbook.exportFile', {
        title: get(workbookDocumentAtom).title,
      })
      if (get(rustWorkbookConnectionAtom) !== connection) return false
      await input.write(file)
    } else {
      let text: string | null = null
      if (input.action === 'open') {
        if (!Number.isSafeInteger(input.size) || input.size <= 0 ||
          input.size > WORKBOOK_FILE_MAX_BYTES)
          throw new Error('Choose a non-empty workbook file no larger than 64 MiB.')
        text = await input.read()
      }
      if (get(rustWorkbookConnectionAtom) !== connection) return false
      replaced = await set(replaceRustWorkbookRuntimeAtom, text)
      if (!replaced) {
        const error = get(workbookReplacementErrorAtom)
        if (error) throw new Error(error.message)
        return false
      }
    }
    set(stateAtom, { open: input.action === 'download', busy: false, error: false,
      message: input.action === 'download' ? 'Download requested. Keep the file to save your work.' : '' })
    return true
  } catch (error) {
    if (get(rustWorkbookConnectionAtom) === connection || replaced)
      set(stateAtom, { ...state, busy: false, error: true,
        message: `${error instanceof Error ? error.message : String(error)} Current workbook kept.` })
    return false
  } finally {
    if (get(stateAtom) === pending) set(stateAtom, { ...state, busy: false })
  }
})
