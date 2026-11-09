//! 工作簿媒体库：图片等二进制按内容寻址存一份，浮动对象经 `SheetDrawing::media` 引用 id。
//! 条目只增不改、不进撤销历史：删掉对象后条目留在本次会话里（撤销能恢复图片），
//! 保存时只写出仍被对象引用的条目。类型按文件头识别，不信任调用方声明。
use std::collections::BTreeMap;
use std::sync::Arc;

pub mod base64;

pub const MAX_MEDIA_BYTES: usize = 10 * 1024 * 1024;
pub const MAX_MEDIA_TOTAL_BYTES: usize = 200 * 1024 * 1024;
const MAX_MEDIA_ID_CHARS: usize = 64;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MediaItem {
    pub mime: &'static str,
    pub bytes: Arc<[u8]>,
}

#[derive(Clone, Debug, Default)]
pub struct MediaStore {
    items: BTreeMap<String, MediaItem>,
    total: usize,
}

/// 按文件头识别支持的图片类型；SVG 不收（可含脚本，且 Excel 需配 PNG 回退）。
pub fn sniff_image_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else if bytes.starts_with(b"BM") && bytes.len() > 26 {
        Some("image/bmp")
    } else {
        None
    }
}

/// 文件扩展名（XLSX `xl/media/imageN.ext`）。
pub fn image_extension(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" => "jpeg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/bmp" => "bmp",
        _ => "png",
    }
}

pub fn valid_media_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= MAX_MEDIA_ID_CHARS
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// FNV-1a 64 + 长度：同一份字节总得到同一个 id，重复插入同一张图只存一次。
fn content_id(bytes: &[u8]) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    format!("m{hash:016x}{:x}", bytes.len())
}

impl MediaStore {
    pub fn get(&self, id: &str) -> Option<&MediaItem> {
        self.items.get(id)
    }

    pub fn iter(&self) -> impl Iterator<Item = (&str, &MediaItem)> {
        self.items.iter().map(|(id, item)| (id.as_str(), item))
    }

    pub fn total_bytes(&self) -> usize {
        self.total
    }

    /// 存入一张图片并返回 id；已有相同字节时直接返回原 id。
    pub fn put(&mut self, bytes: &[u8]) -> Result<String, &'static str> {
        let mime = sniff_image_type(bytes)
            .ok_or("Only PNG, JPEG, GIF, WebP and BMP images are supported.")?;
        if bytes.len() > MAX_MEDIA_BYTES {
            return Err("An image cannot exceed 10 MiB.");
        }
        let base = content_id(bytes);
        let mut id = base.clone();
        let mut suffix = 1;
        // 哈希撞车（不同字节同 id）时加序号，绝不覆盖已有条目。
        while let Some(existing) = self.items.get(&id) {
            if *existing.bytes == *bytes {
                return Ok(id);
            }
            id = format!("{base}-{suffix}");
            suffix += 1;
        }
        self.insert(id.clone(), mime, bytes)?;
        Ok(id)
    }

    /// 文件恢复：id 原样保留（对象按它引用），类型仍按文件头重新识别。
    pub fn restore(&mut self, id: String, bytes: &[u8]) -> Result<(), &'static str> {
        if !valid_media_id(&id) {
            return Err("Image ids must be 1-64 letters, digits, '-' or '_'.");
        }
        if self.items.contains_key(&id) {
            return Err("Image ids must be unique within a workbook.");
        }
        let mime = sniff_image_type(bytes)
            .ok_or("Only PNG, JPEG, GIF, WebP and BMP images are supported.")?;
        if bytes.len() > MAX_MEDIA_BYTES {
            return Err("An image cannot exceed 10 MiB.");
        }
        self.insert(id, mime, bytes)
    }

    fn insert(&mut self, id: String, mime: &'static str, bytes: &[u8]) -> Result<(), &'static str> {
        if self.total + bytes.len() > MAX_MEDIA_TOTAL_BYTES {
            return Err("A workbook can hold at most 200 MiB of images.");
        }
        self.total += bytes.len();
        self.items.insert(id, MediaItem { mime, bytes: Arc::from(bytes) });
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\nrest";

    #[test]
    fn same_bytes_share_one_entry() {
        let mut store = MediaStore::default();
        let a = store.put(PNG).unwrap();
        assert_eq!(store.put(PNG).unwrap(), a);
        assert_eq!(store.total_bytes(), PNG.len());
        assert_eq!(store.get(&a).unwrap().mime, "image/png");
    }

    #[test]
    fn rejects_unknown_types_and_bad_restores() {
        let mut store = MediaStore::default();
        assert!(store.put(b"<svg/>").is_err());
        assert!(store.restore("bad id".into(), PNG).is_err());
        store.restore("m1".into(), PNG).unwrap();
        assert!(store.restore("m1".into(), PNG).is_err());
    }

    #[test]
    fn sniffs_formats() {
        assert_eq!(sniff_image_type(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("image/jpeg"));
        assert_eq!(sniff_image_type(b"GIF89a.."), Some("image/gif"));
        assert_eq!(sniff_image_type(b"RIFF\0\0\0\0WEBPVP8 "), Some("image/webp"));
        assert_eq!(image_extension("image/jpeg"), "jpeg");
    }
}
