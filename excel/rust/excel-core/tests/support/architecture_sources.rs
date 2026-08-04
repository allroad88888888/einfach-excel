//! Source-family collection for architecture invariant tests.

use std::fs;
use std::path::{Path, PathBuf};

pub(crate) fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

pub(crate) fn read(path: &Path) -> String {
    fs::read_to_string(path).unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()))
}

fn production(source: &str) -> String {
    source
        .split("#[cfg(test)]")
        .next()
        .unwrap_or(source)
        .to_string()
}

/// Reads a root file and all flat `<prefix>*.rs` sibling source files.
///
/// Every file is stripped of its test tail before concatenation so a test
/// module in one sibling cannot hide subsequent production files.
pub(crate) fn source_family_sources(
    root_relative_path: &str,
    child_prefix: &str,
) -> Vec<(String, String)> {
    let root = manifest_dir().join(root_relative_path);
    let dir = root
        .parent()
        .unwrap_or_else(|| panic!("source root has no parent: {}", root.display()));
    let mut names: Vec<String> = fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", dir.display()))
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry
                .file_type()
                .map(|kind| kind.is_file())
                .unwrap_or(false)
        })
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| name.starts_with(child_prefix) && name.ends_with(".rs"))
        .collect();
    names.sort();

    let root_name = root
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or_else(|| panic!("source root has no UTF-8 stem: {}", root.display()))
        .to_string();
    let mut sources = vec![(root_name, production(&read(&root)))];
    for name in names {
        sources.push((
            name.trim_end_matches(".rs").to_string(),
            production(&read(&dir.join(name))),
        ));
    }
    sources
}

pub(crate) fn source_family_text(root_relative_path: &str, child_prefix: &str) -> String {
    source_family_sources(root_relative_path, child_prefix)
        .into_iter()
        .map(|(_, source)| source)
        .collect::<Vec<_>>()
        .join("\n")
}
