//! 门禁：实际内建函数臂的分发名集合 ⊇ `is_builtin_function_name` 的保留名清单，
//! 且两者差集恰好等于一份**显式白名单**。
//!
//! 为什么需要它：保留名清单是宿主注册 JS 自定义公式时的拒绝依据。求值优先级是
//! 「内建 → 定义名 LAMBDA → 宿主自定义公式 → `#NAME?`」，所以一个**分发得到、
//! 却不在保留清单里**的名字，会在注册侧被放行、在求值时被内建静默遮蔽 —— 用户
//! 的函数永远不跑，且没有任何报错。这正是这条门禁存在的理由。
//!
//! 历史：清单一度只有 426 项，而 `eval_func` 分发 500 项，74 项缺口（整个 `IM*`
//! 复数家族、`ACCRINT` / `PRICE` / `YIELD` / `XIRR` 等金融扩展批、`ARRAYTOTEXT` /
//! `UNICHAR` / `SHEET` 文本信息批、以及 `RANKEQ` / `RANKAVG` 两个无点别名）。成因
//! 是增量实现只加分发臂、没同步清单，而当时**没有任何断言**盯这一侧。
//!
//! 放 Rust 侧而不是 JS 侧，判据只有一条：加内建的人会先跑 `cargo test`。JS 侧的
//! `excel/spreadsheet-ui-core/test/engine-builtin-mirror.test.ts` 管的是下一段
//! —— 保留名清单 vs 它生成的 JS 镜像。两段串起来才是完整链路。
//!
//! 防假绿：根路由选择器与子模块实际臂严格相等，并有精确数量、锚点、逐项形状及
//! 「文本抽取结果 vs 编译后真函数」的对照。扫描器一旦失效会立刻炸掉。

mod eval_source_scan;

use std::collections::BTreeSet;

use einfach_excel_core::is_builtin_function_name;
use eval_source_scan::{
    actual_dispatches, eval_builtin_name_chars, eval_dispatch_chars, eval_family_chars,
    is_formula_name, reserved_macro_body, reserved_names, routing_selectors,
};

/// 刻意留在保留名清单**之外**的分发名。**现在是空的，并且应当保持为空。**
///
/// 这里曾经登记着 `REGEXTEST` / `REGEXEXTRACT` / `REGEXREPLACE` —— 它们是唯一被
/// `#[cfg(feature = "regex-formulas")]` 门控的内建，lite 构建下并不存在，所以
/// 「要不要保留」两边都有代价：保留掐掉了「lite + 用 JS polyfill REGEX*」这个
/// 合理用法；不保留则同一份工作簿在 lite / full 下可能算出不同的值。
///
/// owner 已裁决**保留**（跨构建一致性优先，见 `eval.rs::is_builtin_function_name`
/// 里 REGEX* 那三行的注释），于是这个数组空了。
///
/// 它**不是**死代码：留着是为了让「刻意的例外」与「忘了同步」在失败时可区分。
/// 忘了同步 → 下面的断言直接失败；真要开新的例外 → 必须有人动手往这里加一个名字
/// 并写下理由。空数组本身就是一条断言：**今天没有任何例外。**
const RESERVED_NAME_WHITELIST: &[&str] = &[];

/// 484 个直接函数分发臂，包含别名后共 502 个函数名。
const EXPECTED_DISPATCH_ARM_COUNT: usize = 484;
const EXPECTED_BUILTIN_NAME_COUNT: usize = 502;

/// 形状自检：任何合理的抽取结果都必须含有这几个名字。
const ANCHOR_NAMES: &[&str] = &[
    "SUM", "IF", "LAMBDA", "LET", "XLOOKUP", "MAP", "REDUCE", "T.DIST",
];

fn actual_dispatch() -> eval_source_scan::DispatchScan {
    actual_dispatches(&eval_family_chars())
}

#[test]
fn extractors_are_not_vacuous() {
    let src = eval_builtin_name_chars();
    let dispatch = actual_dispatch();
    let reserved = reserved_names(&src);

    assert!(
        dispatch.arm_count == EXPECTED_DISPATCH_ARM_COUNT,
        "实际函数臂数量变更：预期 {EXPECTED_DISPATCH_ARM_COUNT}，实际 {}。\
         请同步确认别名与扫描器语义。",
        dispatch.arm_count
    );
    assert!(
        dispatch.names.len() == EXPECTED_BUILTIN_NAME_COUNT,
        "实际分发名数量变更：预期 {EXPECTED_BUILTIN_NAME_COUNT}，实际 {}。",
        dispatch.names.len()
    );
    assert!(
        reserved.len() == EXPECTED_BUILTIN_NAME_COUNT,
        "保留名数量变更：预期 {EXPECTED_BUILTIN_NAME_COUNT}，实际 {}。",
        reserved.len()
    );
    for anchor in ANCHOR_NAMES {
        assert!(dispatch.names.contains(*anchor), "分发名里没有锚点 {anchor}");
        assert!(reserved.contains(*anchor), "保留名里没有锚点 {anchor}");
    }
    for n in dispatch.names.iter().chain(reserved.iter()) {
        assert!(is_formula_name(n), "抽到了不像公式名的字面量：{n:?}");
    }
}

#[test]
fn root_routing_selectors_match_actual_function_arms() {
    let routing = routing_selectors(&eval_dispatch_chars());
    let actual = actual_dispatch();

    assert_eq!(
        routing.names, actual.names,
        "eval.rs 路由选择器与 eval_fn_* 子模块的实际函数臂不一致"
    );
}

#[test]
fn reserved_list_has_no_cfg_gated_arms() {
    // 保留名清单一旦被 `#[cfg]` 切分，「清单」就随构建配置而变：纯文本抽取会得到
    // 所有配置的并集，而任一构建实际只保留其中一个子集 —— 那时这条门禁的语义需要
    // 重新定义。先在这里炸掉，逼人先想清楚再改。
    let body = reserved_macro_body(&eval_builtin_name_chars());
    assert!(!body.contains("#[cfg("), "保留名清单里出现了 #[cfg] 门控");
}

#[test]
fn dispatch_covers_reserved_list() {
    let src = eval_builtin_name_chars();
    let dispatch = actual_dispatch();
    let orphans: Vec<String> = reserved_names(&src)
        .difference(&dispatch.names)
        .cloned()
        .collect();
    assert!(
        orphans.is_empty(),
        "这些名字在保留名清单里，但 eval_func 根本不分发它们 —— 要么内建被删了而\
         清单没跟着删，要么清单把名字写错了：{orphans:?}"
    );
}

#[test]
fn dispatch_minus_reserved_equals_whitelist() {
    let src = eval_builtin_name_chars();
    let dispatch = actual_dispatch();
    let gap: BTreeSet<String> = dispatch
        .names
        .difference(&reserved_names(&src))
        .cloned()
        .collect();
    let whitelist: BTreeSet<String> = RESERVED_NAME_WHITELIST
        .iter()
        .map(|s| (*s).to_string())
        .collect();

    let unreserved: Vec<&String> = gap.difference(&whitelist).collect();
    assert!(
        unreserved.is_empty(),
        "eval_func 分发了这些名字，但 is_builtin_function_name 没保留它们。宿主注册\
         同名自定义公式会被放行、再被内建静默遮蔽。把它们补进 \
         is_builtin_function_name 的 matches! 臂，然后重跑 \
         `node excel/spreadsheet-ui-core/scripts/extract-builtin-names.mjs` 同步 JS \
         镜像；若确属刻意例外，写进 RESERVED_NAME_WHITELIST 并说明理由：{unreserved:?}"
    );

    let stale: Vec<&String> = whitelist.difference(&gap).collect();
    assert!(
        stale.is_empty(),
        "白名单里的名字已经不是缺口了（被补进保留清单，或分发臂被删）—— 从 \
         RESERVED_NAME_WHITELIST 里删掉：{stale:?}"
    );
}

/// 编译产物侧的对照：文本抽取说保留的，真函数也必须说保留。
/// 纯文本门禁最大的盲点是「抽的和编译的不是同一个东西」，这条把两者钉在一起。
#[test]
fn extracted_reserved_names_match_the_compiled_function() {
    let src = eval_builtin_name_chars();
    for name in reserved_names(&src) {
        assert!(
            is_builtin_function_name(&name),
            "{name} 出现在 matches! 体里，但 is_builtin_function_name 返回 false"
        );
    }
    // 本次补进来那批的行为锚点（每个子批各取一个）。
    for name in [
        "XIRR", "IMABS", "ACCRINT", "UNICHAR", "RANKEQ", "SHEETS", "COMPLEX",
    ] {
        assert!(is_builtin_function_name(name), "{name} 应当已被保留");
    }
    // 白名单成员刻意**不**保留 —— 这是当前的既定行为，改它得先改白名单。
    for name in RESERVED_NAME_WHITELIST {
        assert!(
            !is_builtin_function_name(name),
            "{name} 在白名单里，却已被保留 —— 同步 RESERVED_NAME_WHITELIST"
        );
    }
}
