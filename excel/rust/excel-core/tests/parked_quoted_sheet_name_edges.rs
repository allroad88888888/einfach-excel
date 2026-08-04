//! 停泊态引号跳过的边角：`''` 转义、引号未闭合、名字里的 `!`、以及与字符串
//! 字面量的分工。
//!
//! 正向契约（表名逐字节存活 + 求值仍对）在 `parked_quoted_sheet_name.rs`；
//! 这里只压边界。入口同样是真实的 `install_sheet_bulk` + 结构编辑。

mod parked_quoted_support;

use parked_quoted_support::{assert_byte_identical_under_all_ops, parked_text, Op, ALL_OPS};

// =====================================================================
// `''` 是转义的单引号，不是闭合
// =====================================================================

/// 名字里的 `''` 不能被当成「闭合 + 重开」—— 否则 `'It''s A1'` 会在中间断开，
/// 露在外面的 ` s A1` 里那个 `A1` 就被当成同表引用改写。
///
/// 三条依次加码：只有转义 / 转义**并且**名字里有地址形状（最毒的一条）/
/// 地址形状被转义劈成两半。
#[test]
fn escaped_quote_pair_is_not_a_closing_quote() {
    assert_byte_identical_under_all_ops("='It''s'!A1");
    assert_byte_identical_under_all_ops("='It''s A1'!B2");
    assert_byte_identical_under_all_ops("='A1''B2'!C3");
    assert_byte_identical_under_all_ops("='''A1'!B2"); // 名字以一个 `'` 开头
}

/// 空名字 `''`：`scan_quoted_name` 认它（返回空串），字节侧必须给同一个边界，
/// 否则那两个引号会被当成「开引号 + 没闭合」，后面整截失去保护。
#[test]
fn empty_quoted_name_closes_immediately() {
    assert_byte_identical_under_all_ops("=''!A1");
    assert_byte_identical_under_all_ops("=''");
    assert_byte_identical_under_all_ops("=''!A1+''!B2");
}

// =====================================================================
// 引号未闭合：不跑飞，也不吞掉后面所有字节
// =====================================================================

/// 用户输入到一半就停泊（`bulk_install_storage` 不做解析校验）。
///
/// 这种源码在 AST 侧同样解析不出来，两条路径同为 `#VALUE!`，所以文本怎么走
/// 都不改变求值结果。要守的是另外两条：**扫描器必须停下来**，且**不吞尾** ——
/// 不像字符串字面量那样一路吃到结尾，否则一个漂在半截输入里的 `'` 会让后面
/// 所有引用永远失去改写。下面第二条就是「不吞尾」的证据：`A5` 照旧平移。
#[test]
fn unclosed_quote_neither_runs_away_nor_eats_the_tail() {
    assert_eq!(parked_text("='Q1 2024", Op::InsertRow), "='Q2 2024");
    assert_eq!(parked_text("='Q1 2024&A5", Op::InsertRow), "='Q2 2024&A6");
    assert_eq!(parked_text("=SUM('A1", Op::InsertCol), "=SUM('B1");
    // 前面闭合了的那个名字仍受保护，后面没闭合的那个不牵连它。
    assert_eq!(
        parked_text("='A1'!B1+'Q1 2024", Op::InsertRow),
        "='A1'!B1+'Q2 2024"
    );
}

/// 一串裸引号 / 只有开引号 / 非 ASCII 尾巴：只要求扫描器**返回**（用例跑完
/// 本身就是证明），并且不多吃不少吃。
#[test]
fn hostile_unclosed_quote_shapes_terminate() {
    for src in ["='", "='''''''''", "='销售 数据", "='It''s"] {
        assert_byte_identical_under_all_ops(src);
    }
}

// =====================================================================
// 名字里的 `!`
// =====================================================================

/// 分隔符是**闭合引号之后**那个 `!`，引号内的 `!` 只是名字的一部分。
///
/// 这三条同时压着两件事：引号跳过没把内部的 `!` 当分隔符，以及跳过之后
/// `prev == b'!'` 仍能让跨表守卫接管尾巴上的引用。
#[test]
fn bang_inside_a_quoted_name_is_not_a_separator() {
    assert_byte_identical_under_all_ops("='A!B'!A1");
    assert_byte_identical_under_all_ops("='A!B1'!C2");
    assert_byte_identical_under_all_ops("='!'!A1");
    assert_byte_identical_under_all_ops("='A1!B2'!C3");
}

/// 带引号表名 + 溢出锚点尾巴 `D1#`：跨表守卫认得它的边界，锚点不平移。
#[test]
fn spill_anchor_tail_after_a_quoted_name_is_pinned() {
    assert_byte_identical_under_all_ops("='Q1 2024'!A1#");
    assert_byte_identical_under_all_ops("=SUM('Q1 2024'!D1#)");
}

// =====================================================================
// 与字符串字面量的分工
// =====================================================================

/// 字符串**内容**长得像带引号表名时不能被改写；同一条公式里真正的同表引用
/// 该动还得动。`"` 分支排在 `'` 分支之前，两者在记号起点上互斥。
#[test]
fn string_literal_shaped_like_a_quoted_sheet_name_is_left_alone() {
    assert_eq!(
        parked_text("=IF(A1,\"'A1'!B1\",\"x\")", Op::InsertRow),
        "=IF(A2,\"'A1'!B1\",\"x\")"
    );
    assert_eq!(
        parked_text("=IF(A1,\"'Q1 2024'!A1\",'Q1 2024'!A1)", Op::InsertRow),
        "=IF(A2,\"'Q1 2024'!A1\",'Q1 2024'!A1)"
    );
}

/// 反过来：字符串里的**单引号**不得启动引号跳过，否则后面的引用被顺手吞掉。
#[test]
fn apostrophe_inside_a_string_literal_does_not_open_a_quoted_name() {
    assert_eq!(parked_text("=\"it's\"&A1", Op::InsertRow), "=\"it's\"&A2");
    assert_eq!(parked_text("=\"A1'\"&A1", Op::InsertRow), "=\"A1'\"&A2");
    for op in ALL_OPS {
        assert_eq!(parked_text("=\"it's\"", op), "=\"it's\"");
    }
}
