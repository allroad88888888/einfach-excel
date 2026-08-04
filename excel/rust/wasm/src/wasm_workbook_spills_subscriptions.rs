#[wasm_bindgen]
impl WasmWorkbook {
    #[wasm_bindgen(js_name = "spillAnchor")]
    pub fn spill_anchor(&self, sheet_idx: u32, addr: &str) -> JsValue {
        match self.workbook.spill_anchor(sheet_idx as usize, addr) {
            Some(anchor) => JsValue::from_str(&anchor.to_string()),
            None => JsValue::null(),
        }
    }

    /// 碰撞态（`#SPILL!`）锚点是被哪一格挡住的 —— 返回 `"B3"` 形式的地址字符串，
    /// 答不出时 `null`。UI 拿它给用户一句「把 B3 清掉就好了」，这是 `#SPILL!`
    /// 唯一缺的那条线索（`spillInfo` 对碰撞态锚点恒回 `null`，因为它一格都没装上）。
    ///
    /// 答不出的三种情形在 JS 侧不区分，因为处理方式一样 —— 不说话：`addr` 不是碰撞态
    /// 锚点、碰撞原因是矩形跑出表边（没有哪一格该被指责）、矩形大到超出扫描上限。
    /// 语义与上限的完整说明见 `sheet_spill_blocker.rs`。
    #[wasm_bindgen(js_name = "spillBlocker")]
    pub fn spill_blocker(&self, sheet_idx: u32, addr: &str) -> JsValue {
        match self.workbook.spill_blocker(sheet_idx as usize, addr) {
            Some(blocker) => JsValue::from_str(&blocker.to_string()),
            None => JsValue::null(),
        }
    }

    /// Read a cell's display string through the workbook eval path.
    /// Convenience wrapper around `get_display(u32, ...)` with `usize`
    /// for the Phase 3 canonical API shape. The `&mut self` receiver
    /// future-proofs against `Workbook::get_cell` requiring a mutable
    /// borrow once cache promotion lands on the workbook eval provider —
    /// today it is read-only, but flipping the underlying signature
    /// must not break the JS API.
    #[wasm_bindgen(js_name = "getCellDisplay")]
    pub fn get_cell_display(&mut self, sheet_idx: usize, addr: &str) -> String {
        let Some(name) = self.workbook.name(sheet_idx).map(str::to_string) else {
            return String::new();
        };
        let val = self.workbook.get_cell(&name, addr);
        value_to_display(&val)
    }

    /// Subscribe to a cell at `sheet_name!addr`. Returns an opaque
    /// `u32` token; pass it back to `unsubscribe_cell` to cancel.
    ///
    /// The callback subscribes to the sheet's stable cell facade. Local and
    /// cross-sheet dependencies both settle through the workbook-scoped Store;
    /// this map only owns the opaque token and sheet-remap lifecycle.
    pub fn subscribe_cell(&mut self, sheet_name: &str, addr: &str, cb: js_sys::Function) -> u32 {
        let Some(sheet_idx) = self.workbook.index_of(sheet_name) else {
            // Unknown sheet — hand back a token that is never inserted,
            // mirroring `unsubscribe_cell`'s idempotent posture. Caller
            // can `unsubscribe_cell(token)` safely as a no-op.
            let token = self.next_token;
            self.next_token = self.next_token.wrapping_add(1);
            return token;
        };
        if CellAddress::parse(addr).is_none() {
            let token = self.next_token;
            self.next_token = self.next_token.wrapping_add(1);
            return token;
        }

        let token = self.next_token;
        self.next_token = self.next_token.wrapping_add(1);

        let listener = JsCallbackListener { callback: cb };
        let Some(sheet) = self.workbook.sheet_mut(sheet_idx) else {
            return token;
        };
        let sub = sheet.subscribe_cell_boxed(addr, Box::new(listener));
        self.subscriptions
            .insert(token, WorkbookCellSubscription { sheet_idx, sub });
        token
    }

    /// Cancel a subscription previously returned from `subscribe_cell`.
    /// Idempotent: unknown / stale tokens are silently ignored.
    pub fn unsubscribe_cell(&mut self, token: u32) {
        if let Some(entry) = self.subscriptions.remove(&token) {
            if let Some(sheet) = self.workbook.sheet_mut(entry.sheet_idx) {
                sheet.unsubscribe_cell(entry.sub);
            }
        }
    }

    // Wave 8: register a JS callback as a workbook-scope custom formula.
    // After this call, `=MYFUNC(...)` in any cell resolves through the
    // registry: the engine evaluates the args eagerly, then invokes the
    // callback with a JS Array of marshaled args. Lookup is case-
    // insensitive (the engine receives upper-cased names from the
    // formula parser; we upper-case `name` here to match).
    //
    // JS signature contract:
    //   `(args: Array<number|string|boolean|null>) => number | string |`
    //   `  boolean | null | { error: "#DIV/0!" | ... }`
    // If the callback throws, the cell surfaces `#VALUE!`. If it returns
    // a Date, function, or other non-scalar object, the cell also surfaces
    // `#VALUE!` (internally `ValueError::WrongType`; Excel has no `#TYPE!`
    // code, so the display boundary collapses it). NaN / Infinity return
    // values are folded to `#NUM!`.
    //
    // Registering over an existing name silently replaces the callback and
    // publishes the custom-registry Store root. Materialized formulas that
    // consulted the registry re-derive; unread formulas remain lazy.
}
