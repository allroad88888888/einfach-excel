//! 读取求值器根文件及其分派子模块。

use std::fs;
use std::path::{Path, PathBuf};

fn read_chars(path: &Path) -> Vec<char> {
    fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("读不到 {}: {e}", path.display()))
        .chars()
        .collect()
}

fn source_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src")
}

/// 把根分派实现读成字符序列。
pub fn eval_dispatch_chars() -> Vec<char> {
    read_chars(&source_dir().join("eval_core_dispatch.rs"))
}

/// 读取分段的内建保留名实现。
pub fn eval_builtin_name_chars() -> Vec<char> {
    let src = source_dir();
    let mut chars = Vec::new();
    for file in [
        "eval_builtin_names_a_h.rs",
        "eval_builtin_names_i_r.rs",
        "eval_builtin_names_s_z.rs",
    ] {
        chars.extend(read_chars(&src.join(file)));
        chars.push('\n');
    }
    chars
}

/// 读取根路由与所有 `eval_fn_*.rs` 分派子模块，按文件名稳定排序。
pub fn eval_family_chars() -> Vec<Vec<char>> {
    let src = source_dir();
    let mut paths = vec![src.join("eval.rs")];
    let mut modules: Vec<PathBuf> = fs::read_dir(&src)
        .unwrap_or_else(|e| panic!("读不到 {}: {e}", src.display()))
        .map(|entry| entry.expect("读取 src 目录项失败").path())
        .filter(|path| {
            path.extension().is_some_and(|ext| ext == "rs")
                && path
                    .file_name()
                    .is_some_and(|name| name.to_string_lossy().starts_with("eval_fn_"))
        })
        .collect();
    modules.sort();
    paths.extend(modules);
    paths.iter().map(|path| read_chars(path)).collect()
}
