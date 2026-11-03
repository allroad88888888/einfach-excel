use einfach_core::{Store, Value};
use std::sync::Arc;

#[test]
fn text_clones_share_storage_and_compare_contents() {
    fn send_sync<T: Send + Sync>() {}
    send_sync::<Value>();
    let text: Arc<str> = "long text".repeat(100).into();
    let value = Value::Text(text.clone());
    let Value::Text(copy) = value.clone() else {
        panic!()
    };
    assert!(Arc::ptr_eq(&text, &copy));
    assert_eq!(value, Value::Text(text.to_string().into()));
}

#[test]
fn primitive_releases_initial_text_after_read_or_write() {
    for read_first in [false, true] {
        let store = Store::new();
        let text: Arc<str> = "x".repeat(1_000_000).into();
        let weak = Arc::downgrade(&text);
        let id = store.create_atom(Value::Text(text));
        if read_first {
            let value = store.get(id);
            let Value::Text(text) = value else { panic!() };
            assert_eq!(
                Arc::strong_count(&text),
                2,
                "only current and returned values own text"
            );
        }
        store.set(id, Value::Number(2.));
        assert!(
            weak.upgrade().is_none(),
            "old initialization must not retain text"
        );
        assert_eq!(store.get(id), Value::Number(2.));
    }
}
