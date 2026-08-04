/**
 * `wasm-pkg-full/` 缺席时的类型兜底。
 *
 * full 产物是 gitignore 的、默认不构建的目录，而本包的 tsconfig 会把
 * `worker-runtime-full.ts` 这片叶子一起编进程序 —— 没有这份声明，任何没跑过
 * `build:wasm:full` 的人执行 `tsc --noEmit` 都会撞上 TS2307，full 就成了构建期
 * 必需产物。这正是被否掉的那个选项。
 *
 * TS 的解析顺序帮了忙：目录真的存在时，相对路径先按文件解析，用的是 wasm-pack
 * 生成的真 d.ts；只有解析不到才落到这条通配声明。所以 full 在场与缺席两种情况
 * 下 `tsc` 都通过，且在场时类型不会被这份粗声明削弱。
 *
 * 只声明 worker 运行时真正用到的两个成员，与 `WorkerWasmModule` 同形。
 */
declare module '*/wasm-pkg-full/einfach_wasm.js' {
  export default function init(): Promise<unknown>
  export class WasmWorkbook {}
}
