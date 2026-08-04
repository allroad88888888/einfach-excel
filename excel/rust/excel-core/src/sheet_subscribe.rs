//! 一个地址上的订阅：挂接、通知、解绑。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

pub(super) type ListenerRc = Rc<dyn CellListener>;

pub(super) type ListenerList = Rc<RefCell<Vec<(u64, ListenerRc)>>>;

/// Snapshot the listener list (so callbacks may freely re-enter `subscribe` /
/// `unsubscribe` without aliasing the borrow), then dispatch to each.
pub(super) fn dispatch_listeners(list: &ListenerList) {
    let snapshot: Vec<ListenerRc> = list.borrow().iter().map(|(_, l)| l.clone()).collect();
    for listener in snapshot {
        listener.on_change();
    }
}

pub(super) struct AddressListenerFanout {
    pub(super) listeners: ListenerList,
}

impl CellListener for AddressListenerFanout {
    fn on_change(&self) {
        dispatch_listeners(&self.listeners);
    }
}

pub(super) struct AddressSubscriptionBucket {
    pub(super) listeners: ListenerList,
    pub(super) atom_id: Option<AtomId>,
    pub(super) store_sub: Option<SubscriptionId>,
}

/// Token returned by `Sheet::subscribe_cell`. The public subscription is tied
/// to a cell address; internally it is wired to the stable per-address facade
/// atom so formula/literal swaps do not require listener remapping.
#[derive(Clone, Copy, Debug)]
pub struct CellSubscription {
    pub(super) addr: CellAddress,
    pub(super) listener_id: u64,
}

impl Sheet {
    /// Detach this address's fanout from the store. The bucket and its
    /// listener list are kept; only the underlying `store.sub` goes away.
    /// Returns `true` if a fanout was actually attached. Used as the first
    /// half of `with_remap`: detach → mutate → reattach + manual fire.
    pub(super) fn detach_address_sub(&mut self, addr: CellAddress) -> bool {
        let Some(bucket) = self.cell_subscriptions.get_mut(&addr) else {
            return false;
        };
        let store_sub = bucket.store_sub.take();
        bucket.atom_id = None;
        if let Some(sub_id) = store_sub {
            self.store.unsub(sub_id);
            true
        } else {
            false
        }
    }

    /// Attach (or re-attach) this address's fanout to the stable facade atom.
    /// The facade itself is lazy, but subscribing to an address is the point at
    /// which the stable anchor is intentionally materialized.
    pub(super) fn attach_address_sub(&mut self, addr: CellAddress) {
        if !self.cell_subscriptions.contains_key(&addr) {
            return;
        }
        let new_atom = Some(self.facade_of(addr));
        let Some(bucket) = self.cell_subscriptions.get_mut(&addr) else {
            return;
        };
        if bucket.store_sub.is_some() && bucket.atom_id == new_atom {
            return;
        }
        if let Some(sub_id) = bucket.store_sub.take() {
            self.store.unsub(sub_id);
        }
        bucket.atom_id = new_atom;
        if let Some(atom_id) = new_atom {
            let fanout = AddressListenerFanout {
                listeners: bucket.listeners.clone(),
            };
            bucket.store_sub = Some(self.store.sub(atom_id, fanout));
        }
    }

    pub(super) fn has_address_subscribers(&self, addr: CellAddress) -> bool {
        self.cell_subscriptions
            .get(&addr)
            .map(|b| !b.listeners.borrow().is_empty())
            .unwrap_or(false)
    }

    pub(super) fn notify_address_subscribers(&self, addr: CellAddress) {
        if let Some(bucket) = self.cell_subscriptions.get(&addr) {
            dispatch_listeners(&bucket.listeners);
        }
    }

    /// Subscribe to changes on a single cell address. The returned token is
    /// stable across primitive/formula remaps for this address.
    pub fn subscribe_cell(
        &mut self,
        addr_str: &str,
        listener: impl CellListener,
    ) -> CellSubscription {
        let addr = CellAddress::parse(addr_str).expect("invalid cell address");
        self.subscribe_cell_rc(addr, Rc::new(listener))
    }

    /// Variant of `subscribe_cell` that accepts an already-boxed listener.
    pub fn subscribe_cell_boxed(
        &mut self,
        addr_str: &str,
        listener: Box<dyn CellListener>,
    ) -> CellSubscription {
        let addr = CellAddress::parse(addr_str).expect("invalid cell address");
        self.subscribe_cell_rc(addr, Rc::from(listener))
    }

    /// Cancel a subscription previously returned from `subscribe_cell`.
    pub fn unsubscribe_cell(&mut self, sub: CellSubscription) {
        let should_remove = if let Some(bucket) = self.cell_subscriptions.get_mut(&sub.addr) {
            bucket
                .listeners
                .borrow_mut()
                .retain(|(id, _)| *id != sub.listener_id);
            bucket.listeners.borrow().is_empty()
        } else {
            false
        };

        if should_remove {
            if let Some(bucket) = self.cell_subscriptions.remove(&sub.addr) {
                if let Some(store_sub) = bucket.store_sub {
                    self.store.unsub(store_sub);
                }
            }
        }
    }

    pub(super) fn subscribe_cell_rc(&mut self, addr: CellAddress, listener: ListenerRc) -> CellSubscription {
        let listener_id = self.next_cell_sub_id;
        self.next_cell_sub_id += 1;

        let bucket =
            self.cell_subscriptions
                .entry(addr)
                .or_insert_with(|| AddressSubscriptionBucket {
                    listeners: Rc::new(RefCell::new(Vec::new())),
                    atom_id: None,
                    store_sub: None,
                });
        bucket.listeners.borrow_mut().push((listener_id, listener));
        self.attach_address_sub(addr);

        CellSubscription { addr, listener_id }
    }
}
