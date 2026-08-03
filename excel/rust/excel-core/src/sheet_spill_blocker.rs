//! 回答一个问题，只回答这一个：**这个 `#SPILL!` 要清哪一格才能溢出来。**
//!
//! 用户看到 `#SPILL!` 时唯一想知道的事就是「把哪一格清掉就好了」。ADR 0006 阶段 2
//! 之前引擎连自己都答不出（`register_spill` 碰撞时直接 `return Err`），阶段 2 加的
//! Blocked claims 记的是**反方向**的事实（`addr → 哪个 anchor 想要它`），拿不来回答
//! 「anchor 被谁挡住」。本模块补的就是这一问。
//!
//! # 「撞上的那一格」不等于「要清的那一格」
//!
//! 扫描撞上的可能是**别的数组的投影格** —— 一个用户没打过任何东西的格子。报它是
//! 误导：按 ADR 0006，往投影格里写或清会把那个数组整个塌成 `#SPILL!`，用户拿一个
//! `#SPILL!` 换来另一个。所以撞上投影格时，本模块用已有的反查索引
//! `spill_target_anchor` 追一步，报**那个数组的锚点** —— 那才是清掉之后被挡的数组
//! 真能溢出来的那一格。
//!
//! **只追一步，不循环，也不需要防环。** 前提是「一个地址不可能既是锚点又是投影格」，
//! 而这条由 `register_spill` 的碰撞谓词本身保证，不是巧合：
//!
//! - 锚点若是数组公式格 → `is_target_occupied` 的 (a) 支（`formula_cells` /
//!   `needs_parse` 命中）判它占用，别的数组装不进来；
//! - 锚点若是 `set_array` 那种非公式锚点 → 它的槽位里躺着 `Value::Array`，(b) 支
//!   判它非 `Null`，同样装不进来；
//! - 反方向也堵死：往投影格里写公式先走 `collapse_spill_for_write` 把原数组拆掉，
//!   那一格的 `spill_target_anchor` 条目当场消失，它才成为新锚点。
//!
//! 所以追一步落到的地址一定持有 `Value::Array`、一定不在 `spill_target_anchor` 里，
//! 再追第二步永远是空转。`a_projection_cell_blocker_is_reported_as_its_anchor` 与
//! `another_arrays_anchor_is_reported_as_itself` 两条一起钉住这个前提。
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
//!    字段都没加，一个 map 都没建 —— 它是一个 `&self` 的纯函数，输入是两个**已经
//!    白名单化**的只读索引（`claims` 里那条 `anchor → (rows, cols)`，与安装侧的
//!    `spill_target_anchor` 里那条 `addr → anchor`），加上 Store 已经持有的活单元格
//!    内容。没有结构，就没有可以被称作「边」的东西。
//! 2. **它记录几何，不记录依赖。** 返回值是「矩形里行主序第一个非空格，若那一格是
//!    投影格则换成它的锚点」—— 两步都是**空间**谓词的取值，随时可从 anchor 地址、
//!    数组形状、活内容重新算出来。追加的那一步读的是「这一格落在谁的矩形里」，与
//!    `sheet_spill_claims.rs` 论证里那条「materialised 空间谓词」是同一类事实。
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
//! 反方最强的说法是「它读 claims 与 `spill_target_anchor`，两个都是白名单里的结构」——
//! 成立，但读一个已批准的索引不会让读者继承它的合规负担：本模块从这两个索引各取一个
//! 几何事实（「这个 anchor 想要多大的矩形」、「这一格落在谁的矩形里」），全程只读，
//! 不写入、不建立第三张表，也没有把两者的乘积物化成任何新索引 —— 那一步是每次查询
//! 现算的一次 `get`。
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
    /// `addr` 若是碰撞态（`#SPILL!`）锚点，回答**要清哪一格**它才能溢出来。
    ///
    /// 三种情况都回 `None`，调用方（UI）对它们的处理一样 —— 不说话：
    ///
    /// - `addr` 不是碰撞态锚点（普通格、投影格、正常溢出的锚点）；
    /// - 碰撞的原因不是「某一格被占」而是「矩形跑出表边」——那时没有哪一格该被指责；
    /// - 扫描超出 `BLOCKER_SCAN_LIMIT`。
    ///
    /// 两步得到答案：
    ///
    /// 1. **行主序第一个**被占的格子。这是刻意的：`register_spill` 的碰撞检测就是行主序
    ///    扫的，所以找到的正是**让那次 `register_spill` 失败的那一格**，而不是另一个碰巧
    ///    也挡着的格子。两处顺序必须一致，否则清掉我们指的格子数组仍然不复活。
    /// 2. 那一格若是**别的数组的投影格**，换成那个数组的锚点 —— 见 `blame_for`。
    ///
    /// 于是返回值的语义是「清掉它，`addr` 就能溢出来」，而不是「它在矩形里的第几格」。
    /// 阻塞物是用户自己打的值时两步同一格，行为与第一版一模一样。
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
                    return Some(self.blame_for(target));
                }
            }
        }
        None
    }

    /// 把「撞上的那一格」翻译成「用户要清的那一格」。
    ///
    /// 投影格没有自己的内容，用户清它等于动整个数组，而 ADR 0006 的写入语义会把那个
    /// 数组当场塌成 `#SPILL!` —— 一个错误换一个错误。所以撞上投影格时报它的锚点：
    /// 那才是清掉之后被挡的数组真能溢出来的那一格。
    ///
    /// 一次 `get`，不循环：投影格的锚点不可能又是别人的投影格（模块头「只追一步」那节
    /// 逐条论证了 `register_spill` 的碰撞谓词两个方向都堵死了这种链）。撞上的是用户
    /// 自己打的值或普通公式格时索引里没有它，原样返回。
    fn blame_for(&self, obstruction: CellAddress) -> CellAddress {
        self.spilled_into_anchor(obstruction).unwrap_or(obstruction)
    }
}
