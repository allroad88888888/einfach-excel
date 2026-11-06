//! 在 `dom::Node` 小树上按路径找节点：图表部件嵌套很深（`c:title/c:tx/c:rich/a:p/a:r/a:t`）。

use crate::read::dom::Node;

/// 沿元素名逐层取第一个子节点。
pub fn path<'a>(node: &'a Node, names: &[&str]) -> Option<&'a Node> {
    names.iter().try_fold(node, |current, name| current.child(name))
}

/// 沿路径取最后一层的 `val` 属性。
pub fn val<'a>(node: &'a Node, names: &[&str]) -> Option<&'a str> {
    path(node, names)?.attr("val")
}

/// 先序遍历后代里所有叫 `name` 的节点（不含自身）。
pub fn descendants<'a>(node: &'a Node, name: &str) -> Vec<&'a Node> {
    let mut found = Vec::new();
    let mut stack: Vec<&Node> = node.children.iter().rev().collect();
    while let Some(current) = stack.pop() {
        if current.name == name {
            found.push(current);
        }
        stack.extend(current.children.iter().rev());
    }
    found
}

pub fn first_descendant<'a>(node: &'a Node, name: &str) -> Option<&'a Node> {
    descendants(node, name).into_iter().next()
}

/// `a:t` 文本：同一段落的文字片段直接拼接，段落之间换行。
pub fn rich_text(node: &Node) -> String {
    let paragraphs = descendants(node, "p");
    let texts = |paragraph: &Node| -> String {
        descendants(paragraph, "t").iter().map(|t| t.text.as_str()).collect()
    };
    if paragraphs.is_empty() {
        return descendants(node, "t").iter().map(|t| t.text.as_str()).collect();
    }
    paragraphs.iter().map(|p| texts(p)).collect::<Vec<_>>().join("\n")
}
