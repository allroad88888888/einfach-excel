const DATABASE = 'einfach-excel-demo'
const STORE = 'snapshots'
const KEY = 'local-restore'

function request<T>(run: (store: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode) {
  return new Promise<T>((resolve, reject) => {
    const open = indexedDB.open(DATABASE, 1)
    open.onupgradeneeded = () => open.result.createObjectStore(STORE)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const database = open.result
      const transaction = database.transaction(STORE, mode)
      const pending = run(transaction.objectStore(STORE))
      transaction.oncomplete = () => { database.close(); resolve(pending.result) }
      transaction.onerror = () => { database.close(); reject(transaction.error) }
    }
  })
}

/** 演示宿主把整簿快照存在本浏览器的 IndexedDB；组件本身不碰存储。 */
export async function readSavedSnapshot(): Promise<string | undefined> {
  const value = await request((store) => store.get(KEY), 'readonly')
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function writeSavedSnapshot(snapshot: string): Promise<IDBValidKey> {
  return request((store) => store.put(snapshot, KEY), 'readwrite')
}

export function clearSavedSnapshot(): Promise<undefined> {
  return request((store) => store.delete(KEY), 'readwrite')
}
