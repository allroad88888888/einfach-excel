/**
 * `wasm-pack --target web` 产物的最小模块边界。
 *
 * lite / full 入口只需要提供初始化函数和工作簿构造器；Worker 运行时因此不依赖
 * 具体的 wasm-pkg 目录，也不会把另一份构建意外打进产物。
 */
export type WorkerWasmModule = {
  default: () => Promise<unknown>
  WasmWorkbook: new () => unknown
}
