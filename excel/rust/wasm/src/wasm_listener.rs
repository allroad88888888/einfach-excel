fn install_panic_hook() {
    #[cfg(target_arch = "wasm32")]
    console_error_panic_hook::set_once();
}

thread_local! {
    /// One-shot debug knob: when true, the next `JsCallbackListener::on_change`
    /// fires panic!() inside its microtask. Used by the regression e2e
    /// (`excel/solid-excel/e2e/smoke/regression.spec.ts`) to verify two things in the
    /// real browser:
    ///   1. `console_error_panic_hook` actually surfaces the panic to
    ///      `console.error` (C.10).
    ///   2. The wasm instance survives — the panicking microtask aborts but
    ///      subsequent `set_*` / `get_*` calls keep working.
    /// Cleared on consume so a single arming triggers exactly one panic.
    static PANIC_NEXT_CALLBACK: Cell<bool> = const { Cell::new(false) };
}

/// Adapter listener that bridges core change events to a JS callback.
/// This is the "main-thread adapter" half of the layered subscribe model
/// (ROADMAP 1A D2). The future worker adapter (7C) will implement
/// `CellListener` on top of `postMessage` instead of a direct call.
struct JsCallbackListener {
    callback: js_sys::Function,
}

impl CellListener for JsCallbackListener {
    fn on_change(&self) {
        // Best-effort fire. Queue the JS callback so Solid can re-read the
        // sheet after the current &mut WasmSheet call has returned. Firing
        // synchronously lets reactive subscribers re-enter get_display while
        // set_number/set_formula is still borrowed by wasm-bindgen, which
        // drops the notification on the floor.
        #[cfg(target_arch = "wasm32")]
        {
            let callback = self.callback.clone();
            let task = Closure::once_into_js(move || {
                // Debug knob — see PANIC_NEXT_CALLBACK comment above. Checked
                // inside the microtask so the panic happens AFTER the
                // wasm-bindgen &mut borrow has released, matching real
                // listener panic semantics.
                let should_panic = PANIC_NEXT_CALLBACK.with(|c| {
                    let was = c.get();
                    if was {
                        c.set(false);
                    }
                    was
                });
                if should_panic {
                    panic!("[__debug_panic_next_callback] injected panic for regression test");
                }
                let _ = callback.call0(&JsValue::undefined());
            });
            let queued =
                js_sys::Reflect::get(&js_sys::global(), &JsValue::from_str("queueMicrotask"))
                    .ok()
                    .and_then(|value| value.dyn_into::<js_sys::Function>().ok())
                    .and_then(|queue_microtask| {
                        queue_microtask.call1(&JsValue::undefined(), &task).ok()
                    })
                    .is_some();
            if !queued {
                let delayed =
                    js_sys::Reflect::get(&js_sys::global(), &JsValue::from_str("setTimeout"))
                        .ok()
                        .and_then(|value| value.dyn_into::<js_sys::Function>().ok())
                        .and_then(|set_timeout| {
                            set_timeout
                                .call2(&JsValue::undefined(), &task, &JsValue::from_f64(0.0))
                                .ok()
                        })
                        .is_some();
                if !delayed {
                    let _ = self.callback.call0(&JsValue::undefined());
                }
            }
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            // Native tests do not exercise JS subscriptions, but keep the
            // implementation direct for non-wasm builds.
            let _ = self.callback.call0(&JsValue::undefined());
        }
    }
}
