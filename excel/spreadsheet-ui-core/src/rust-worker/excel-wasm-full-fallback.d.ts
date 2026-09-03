/**
 * `@einfach/excel-wasm/full` 产物缺席时的类型兜底。
 *
 * full 产物（`excel/excel-wasm/full/`）是 gitignore 的、默认不构建的目录，而本包的
 * tsconfig 会把 `worker-runtime-full.ts` 这片叶子一起编进程序 —— 没有这份声明，任何
 * 没跑过 `build:wasm:full` 的人执行 `tsc --noEmit` 都会撞上 TS2307，full 就成了构建期
 * 必需产物。这正是被否掉的那个选项。
 *
 * 必须用**通配**模式而不是精确包名：TS 对精确名的 ambient 声明会永久压过真实解析
 * （full 在场时类型也被这份粗声明削弱），通配模式则是"解析得到真文件时真文件赢，
 * 解析不到才落进来"—— 两种在场状态下 `tsc` 都通过，且在场时类型不打折。代价是
 * 其它 `@einfach/excel-wasm/<拼错的子路径>` 也会被它兜住而不报 TS2307，可接受。
 * 主入口 `@einfach/excel-wasm`（无斜杠）不匹配本模式，lite 缺席仍会硬报错 ——
 * lite 由根脚本 ensureWasm 保证在场。
 *
 * 只声明 worker 运行时真正用到的两个成员，与 `WorkerWasmModule` 同形。
 */
declare module '@einfach/excel-wasm/*' {
  export default function init(): Promise<unknown>
  export class WasmWorkbook {}
}
