//! 回答一个问题，只回答这一个：**这个 `#SPILL!` 是被哪一格挡住的。**
//!
//! 用户看到 `#SPILL!` 时唯一想知道的事就是「把哪一格清掉就好了」。ADR 0006 阶段 2
//! 之前引擎连自己都答不出（`register_spill` 碰撞时直接 `return Err`），阶段 2 加的
//! Blocked claims 记的是**反方向**的事实（`addr → 哪个 anchor 想要它`），拿不来回答
//! 「anchor 被谁挡住」。本模块补的就是这一问。
//!
//! # 为什么是「按需重算」而不是「碰撞时记下来」
//!
//! 最直觉的做法是在 `recompute_array_formula` 的 `Err` 臂里把第一个撞上的地址存进
//! `BlockedClaims`。**不这么做**，三条理由，按权重：
//!
//! 1. **不新增任何状态，就没有 INV-2 的问题。** 见下面的逐条论证 —— 一个不存在的
//!    结构不可能承担「决定什么在变化时重算」的职责。存下来则要重新论证一遍。
//! 2. **存下来会陈旧。** 阻塞地址的正确答案随表内容每次变化；而 claims 的两个上限
//!    （`CLAIM_RECT_LIMIT` / `CLAIM_TOTAL_LIMIT`）明写了「超限的 anchor 不自动复活」，
//!    也就是**存在合法路径让 anchor 停在 `#SPILL!` 而不重跑 `recompute_array_formula`**。
//!    存字段在这条路径上必然给出过期答案（指向一个已经被清空的格子）；现算永远不会。
//! 3. **代价落在正确的地方。** 现算的开销是「扫到第一个阻塞物为止」，与
//!    `register_spill` 第一遍碰撞检测同阶，且**只在用户选中那一格、UI 来问的时候**付；
//!    存字段则把这份开销挪进每一次碰撞重算，包括没人看的那些。
//!
//! # INV-2 合规（`excel/rust/docs/ATOM_DELEGATION_REWRITE_PLAN.md`）
//!
//! 与 `sheet_spill_claims.rs` 模块头同一形式，逐条：
//!
//! 1. **没有新增任何结构。** INV-2 管的是「决定什么在变化时重算的边」。本模块一个
//!    字段都没加，一个 map 都没建 —— 它是一个 `&self` 的纯函数，输入是已经白名单化
//!    的 `claims` 里那条 `anchor → (rows, cols)`，加上 Store 已经持有的活单元格内容。
//!    没有结构，就没有可以被称作「边」的东西。
//! 2. **它记录几何，不记录依赖。** 返回值是「矩形里行主序第一个非空格」——
//!    一个**空间**谓词的取值，随时可从 anchor 地址、数组形状、活内容重新算出来。
//!    它不来自 anchor 的公式文本、引用集合，也不来自任何依赖闭包。
//! 3. **它不决定任何 VALUE，也不触发任何重算。** 唯一的调用方是 WASM 导出
//!    `spillBlocker`，唯一的消费者是 UI 的一句提示文案。把整个模块删掉，引擎能产出的
//!    值一个都不会变，重算的时机也一个都不会变 —— 这比 claims 那条论证还强一档：
//!    claims 至少还影响「什么时候注意到」，本模块连这个都不影响。
//! 4. **Store 的边原则上表达不了它。** 与 claims 同理：spill 碰撞是一条**反依赖** ——
//!    anchor 之所以是 `#SPILL!`，恰恰因为它和阻塞物之间**没有**任何联系，anchor 的公式
//!    从不读那一格。不存在、也不可能存在这样一条 Store 边，除非伪造一个语义上不成立的
//!    依赖。
//!
//! 反方最强的说法是「它读 claims，而 claims 是白名单里的结构」——成立，但读一个已批准
//! 的索引不会让读者继承它的合规负担：本模块只从 claims 取「这个 anchor 想要多大的
//! 矩形」这一个几何事实，且是只读。
//!
//! 本文件同样被 `tests/architecture_invariants.rs` 的 shape 扫描覆盖，所以「搬进自己的
//! 模块」在这里也不能变成绕过禁令的路子。

use crate::cell::CellAddress;

use super::{Sheet, EXCEL_MAX_COLS, EXCEL_MAX_ROWS};

/// 一次查询最多探测多少个格子。
///
/// 与 `sheet_spill_claims.rs` 的 `CLAIM_TOTAL_LIMIT` 取同一个数，理由也同一条：那是本
/// crate 已经定下的「这么多逐格 spill 记账是负担得起的」那条线。超出就诚实回 `None`
/// —— 「不知道」比「乱指一格」好，而且这种情形本身就说明阻塞物离 anchor 很远、
/// 「把它清掉」也不再是一句有用的建议。
///
/// 触到上限需要一个**又大又几乎全空**的矩形：矩形里真有阻塞物时，扫描在第一个阻塞物
/// 处就停了。碰撞态 anchor 的矩形里必定有过阻塞物，所以扫满上限只可能发生在内容变了
/// 而没人重跑 `recompute_array_formula` 的那条上限降级路径上。
const BLOCKER_SCAN_LIMIT: u64 = 65_536;

impl Sheet {
    /// `addr` 若是碰撞态（`#SPILL!`）锚点，回答**行主序第一个**挡住它的格子。
    ///
    /// 三种情况都回 `None`，调用方（UI）对它们的处理一样 —— 不说话：
    ///
    /// - `addr` 不是碰撞态锚点（普通格、投影格、正常溢出的锚点）；
    /// - 碰撞的原因不是「某一格被占」而是「矩形跑出表边」——那时没有哪一格该被指责；
    /// - 扫描超出 `BLOCKER_SCAN_LIMIT`。
    ///
    /// 「行主序第一个」是刻意的：`register_spill` 的碰撞检测就是行主序扫的，所以这里
    /// 报的正是**让那次 `register_spill` 失败的那一格**，而不是另一个碰巧也挡着的格子。
    /// 两处顺序必须一致，否则用户清掉我们指的格子，数组仍然不复活。
    pub fn spill_blocker(&self, addr: CellAddress) -> Option<CellAddress> {
        let (rows, cols) = self.blocked_anchor_shape(addr)?;
        if rows == 0 || cols == 0 {
            return None;
        }
        // 越界失败与「被某一格挡住」是两回事：`register_spill` 在同一个 `Err(Spill)`
        // 里合并了这两种原因，这里先把越界那支摘出去，免得对着一个根本装不下的矩形
        // 扫出一个无辜的格子来。
        let end_row = addr.row.checked_add(rows - 1)?;
        let end_col = addr.col.checked_add(cols - 1)?;
        if end_row >= EXCEL_MAX_ROWS || end_col >= EXCEL_MAX_COLS {
            return None;
        }
        // 碰撞态 anchor 的槽位里躺着 `install_formula_spill` 建出来、随后被写成
        // `Error(Spill)` 的那个 primitive atom —— 与当初调 `register_spill` 时传进去的
        // 是同一个 id，所以复用 `is_target_occupied` 得到的是同一个判定。
        let anchor_atom = self
            .interior
            .cells
            .borrow()
            .get(&addr)
            .and_then(|slot| slot.atom_id())?;

        let mut scanned = 0u64;
        for di in 0..rows {
            for dj in 0..cols {
                if di == 0 && dj == 0 {
                    continue;
                }
                scanned += 1;
                if scanned > BLOCKER_SCAN_LIMIT {
                    return None;
                }
                let target = CellAddress::new(addr.row + di, addr.col + dj);
                if self.is_target_occupied(target, anchor_atom) {
                    return Some(target);
                }
            }
        }
        None
    }
}
