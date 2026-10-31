//! 部件关系文件（`*.rels`）：Id、类型、目标，目标解析成包内绝对路径。

use super::dom;

pub struct Relationship {
    pub id: String,
    pub kind: String,
    /// 内部关系是包内绝对路径；外部关系是原始 Target（URL）。
    pub target: String,
    pub external: bool,
}

/// 部件 `xl/worksheets/sheet1.xml` 的关系文件路径。
pub fn rels_path(part: &str) -> String {
    match part.rsplit_once('/') {
        Some((dir, file)) => format!("{dir}/_rels/{file}.rels"),
        None => format!("_rels/{part}.rels"),
    }
}

/// 部件所在目录（相对目标的基准）。
pub fn dir_of(part: &str) -> &str {
    part.rsplit_once('/').map_or("", |(dir, _)| dir)
}

/// 解析关系文件；相对目标以 `base_dir`（拥有该关系的部件所在目录）为基准。
pub fn parse(xml: &str, base_dir: &str) -> Vec<Relationship> {
    let Some(root) = dom::parse(xml, &[]) else { return Vec::new() };
    root.each("Relationship").map(|node| {
        let external = node.attr("TargetMode") == Some("External");
        let raw = node.attr("Target").unwrap_or_default();
        let target = if external {
            raw.to_string()
        } else {
            match raw.strip_prefix('/') {
                Some(absolute) => absolute.to_string(),
                None => normalize(&format!("{base_dir}/{raw}")),
            }
        };
        Relationship {
            id: node.attr("Id").unwrap_or_default().to_string(),
            kind: node.attr("Type").unwrap_or_default().to_string(),
            target,
            external,
        }
    }).collect()
}

pub fn normalize(path: &str) -> String {
    let mut parts: Vec<&str> = Vec::new();
    for part in path.split('/') {
        match part {
            ".." => {
                parts.pop();
            }
            "." | "" => {}
            _ => parts.push(part),
        }
    }
    parts.join("/")
}
