//! 只扫描带表名前缀的静态引用；未求值公式保持源码态，不解析整条公式或建立计算依赖。
use super::parked_scan::{
    scan_cross_sheet_ref_end, scan_ident_end, scan_quoted_name_end, skip_ascii_ws,
};
use super::{render_formula, rewrite_structural_refs, ShiftEdit};
use crate::formula::parse_formula;

pub(crate) fn rewrite_qualified_source(
    source: &str,
    target: &str,
    edit: ShiftEdit,
) -> Option<String> {
    if !source.contains('!') {
        return None;
    }
    let bytes = source.as_bytes();
    let mut index = 0;
    let mut emitted = 0;
    let mut output = String::new();
    while index < bytes.len() {
        // Excel 字符串里的双引号以双写转义；整段跳过，不解释字符串里的表名或地址。
        if bytes[index] == b'"' {
            index += 1;
            while index < bytes.len() {
                if bytes[index] == b'"' {
                    index += 1;
                    if bytes.get(index) == Some(&b'"') {
                        index += 1;
                    } else {
                        break;
                    }
                } else {
                    index += 1;
                }
            }
            continue;
        }
        // 结构化引用中的 [列名] 不是工作表前缀，不能改成 A1 引用。
        if bytes[index] == b'[' {
            let mut depth = 1;
            index += 1;
            while index < bytes.len() && depth > 0 {
                if bytes[index] == b'[' {
                    depth += 1;
                }
                if bytes[index] == b']' {
                    depth -= 1;
                }
                index += 1;
            }
            continue;
        }
        let start = index;
        let end = if bytes[index] == b'\'' {
            scan_quoted_name_end(bytes, index).unwrap_or(index + 1)
        } else if bytes[index].is_ascii_alphabetic() || bytes[index] == b'_' {
            scan_ident_end(bytes, index)
        } else {
            index += 1;
            continue;
        };
        index = end;
        if bytes.get(end) != Some(&b'!') {
            continue;
        }
        let Some(mut ref_end) = scan_cross_sheet_ref_end(bytes, end + 1) else {
            continue;
        };
        index = ref_end;
        // 只解析这一小段静态引用，复用同一套绝对标记、整行/整列范围规则。
        // 不解析包含它的公式，更不触发该公式的 hydration 或求值。
        let Some(mut reference) = parse_formula(&format!("={}", &source[start..ref_end])) else {
            continue;
        };
        if rewrite_structural_refs(&mut reference, target, false, edit) {
            let postfix = skip_ascii_ws(bytes, ref_end);
            if matches!(reference, crate::formula::Expr::Error(_))
                && bytes.get(postfix) == Some(&b'#')
            {
                // Parser 允许锚点与 # 之间有空白；错误节点不能留下这个后缀。
                ref_end = postfix + 1;
                index = ref_end;
            }
            output.push_str(&source[emitted..start]);
            let rewritten = render_formula(&reference);
            output.push_str(rewritten.strip_prefix('=').unwrap_or(&rewritten));
            emitted = ref_end;
        }
    }
    if emitted == 0 {
        return None;
    }
    output.push_str(&source[emitted..]);
    Some(output)
}
