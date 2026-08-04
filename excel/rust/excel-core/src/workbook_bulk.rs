//! workbook bulk operations.

use super::*;

impl Workbook {
    pub fn debug_cross_sheet_reverse_edge_count(&self) -> usize {
        0
    }

    /// Debug-only: number of candidate ASTs checked for cycles.
    #[doc(hidden)]
    pub fn debug_cycle_ast_walk_count(&self) -> usize {
        self.cycle_ast_walk_count.get()
    }

    /// Retained for host compatibility. Store propagation has no loader BFS.
    #[doc(hidden)]
    pub fn debug_loader_bfs_seed_count(&self) -> usize {
        0
    }

    /// STORAGE_PRIMARY Phase 6.1: read the content revision counter
    /// (OD1). Bumped once per `install_sheet_bulk`; hosts compare
    /// successive values to detect whole-sheet replaces that bypass
    /// per-cell subscriber fanout.
    pub fn content_revision(&self) -> u64 {
        self.content_revision
    }

    /// Storage-primary bulk install: swap pre-built maps directly into the
    /// sheet. Formula parsing and dependency discovery stay lazy; when read,
    /// each formula derives through its formula-inner atom in the shared Store.
    pub fn install_sheet_bulk(
        &mut self,
        sheet_idx: usize,
        primitives: HashMap<CellAddress, Value>,
        formulas: HashMap<CellAddress, String>,
    ) -> Result<BulkInstallStats, InstallError> {
        let store = self.store.clone();
        let mut result = None;
        store.batch(|_| {
            result = Some(
                self.install_sheet_bulk_inner(sheet_idx, primitives, formulas)
                    .map(|(stats, cleanup)| {
                        // 单表：存储落地后紧接着投影 + 通知，与拆分前等价。
                        self.sheets[sheet_idx].finish_bulk_spill_projection(&cleanup);
                        (stats, cleanup)
                    }),
            );
        });
        let (stats, cleanup) = result.expect("sheet install batch closure did not run")?;
        self.reproject_cross_sheet_arrays_after_install(&[sheet_idx]);
        self.sheets[sheet_idx].finish_bulk_install(cleanup);
        Ok(stats)
    }

    /// Body shared by the single-sheet and whole-workbook install APIs.
    fn install_sheet_bulk_inner(
        &mut self,
        sheet_idx: usize,
        primitives: HashMap<CellAddress, Value>,
        formulas: HashMap<CellAddress, String>,
    ) -> Result<(BulkInstallStats, BulkInstallCleanup), InstallError> {
        if self.is_inside_custom_call() {
            return Err(InstallError::MutationDuringCustomCall);
        }
        if sheet_idx >= self.sheets.len() {
            return Err(InstallError::SheetOutOfRange(sheet_idx));
        }

        let (primitives_installed, formulas_installed, cleanup) =
            self.sheets[sheet_idx].bulk_install_storage(primitives, formulas);

        // OD1: bump the revision so subscribers / projections know the
        // world changed without per-cell notifications.
        self.content_revision += 1;

        Ok((
            BulkInstallStats {
                primitives_installed,
                formulas_installed,
                cross_sheet_parsed: 0,
            },
            cleanup,
        ))
    }

    /// 全表替换之后，把**别的表**上依赖这些表的动态数组公式重投一遍。
    ///
    /// 用的是 `set_cell` / `set_formula` 已有的那条机制 —— Store 反向依赖
    /// → `array_formula_addrs_for_store_atoms` → `recompute_array_formulas_in`
    /// —— 只是根集合从"一个写入地址"放大成"整表替换后仍活着的 Store 根原子"
    /// （`store_root_atoms_after_bulk_install`）。
    ///
    /// 没有这一步，`Sheet2!A1 = =SEQUENCE(3)` 被批量重装成 `=SEQUENCE(5)` 之后，
    /// `Sheet1!B1 = =Sheet2!A1#` 的溢出矩形会永远停在旧形状：安装路径此前
    /// 从不做逐格写入路径每次都做的跨表重投影。
    ///
    /// 已安装的表自己不在重投范围内 —— 它们刚在
    /// `finish_bulk_spill_projection` 里对着最终世界投影过。
    ///
    /// 调用时机铁律：**必须在安装的 Store 批次关闭之后**。`bulk_install_storage`
    /// 的失效（`invalidate_formula_inner` / `bump_facade_epoch`）是在一个嵌套
    /// `store_batch` 里发出的，要等最外层批次冲刷才会传到跨表读者身上；批次内
    /// 调用本方法，`recompute_array_formula` 读到的仍是**旧**的 formula-inner，
    /// 于是原样重装旧几何 —— 症状与完全不修一模一样（实测：`=Sheet2!A1#` 停在
    /// 3 行，而同一张表上 `=Sheet2!A1*100` 已经拿到新值）。表自身的投影
    /// （`finish_bulk_spill_projection`）没有这个问题，它面对的是刚停放、
    /// 没有任何缓存值的新公式，所以留在批次内以保证订阅者的原子性。
    fn reproject_cross_sheet_arrays_after_install(&mut self, installed: &[usize]) {
        let mut groups: Vec<(usize, HashSet<CellAddress>)> = Vec::new();
        for &source_sheet in installed {
            let roots = self.sheets[source_sheet].store_root_atoms_after_bulk_install();
            if roots.is_empty() {
                continue;
            }
            let dependent_atoms = self.store.reverse_dependents(&roots);
            for (sheet_idx, sheet) in self.sheets.iter().enumerate() {
                if installed.contains(&sheet_idx) {
                    continue;
                }
                let addrs = sheet.array_formula_addrs_for_store_atoms(&dependent_atoms);
                if !addrs.is_empty() {
                    groups.push((sheet_idx, addrs));
                }
            }
        }
        self.recompute_array_formula_groups(groups);
    }

    /// Whole-workbook variant of [`Self::install_sheet_bulk`] (OD2):
    /// one call installs every sheet's pre-built maps. Sheet indexes
    /// are validated up front so the call is all-or-nothing — no
    /// partial install when a later entry is out of range. The
    /// per-SHEET loop here is fine (sheet counts are small); the
    /// per-CELL loop is what the storage-primary refactor kills.
    ///
    /// 两阶段：**先**把每张表的存储全部落地，**再**逐表投影动态数组。合并成
    /// 一步时，一条读别的表的数组公式（`=Sheet2!A1#`、
    /// `=SORT(Sheet2!A1:A3)`）会对着尚未安装的旧世界投影 —— 载荷里表的先后
    /// 顺序决定它是对是错，而且此后没有任何东西会来纠正它。
    pub fn install_workbook_bulk(
        &mut self,
        payload: Vec<(
            usize,
            HashMap<CellAddress, Value>,
            HashMap<CellAddress, String>,
        )>,
    ) -> Result<Vec<BulkInstallStats>, InstallError> {
        if self.is_inside_custom_call() {
            return Err(InstallError::MutationDuringCustomCall);
        }
        for (sheet_idx, _, _) in &payload {
            if *sheet_idx >= self.sheets.len() {
                return Err(InstallError::SheetOutOfRange(*sheet_idx));
            }
        }
        let store = self.store.clone();
        let mut result = None;
        store.batch(|_| {
            // 阶段 1 —— 所有表的存储先落地，一格投影都不做。
            let landed = payload
                .into_iter()
                .map(|(sheet_idx, primitives, formulas)| {
                    self.install_sheet_bulk_inner(sheet_idx, primitives, formulas)
                        .map(|(stats, cleanup)| (sheet_idx, stats, cleanup))
                })
                .collect::<Result<Vec<_>, InstallError>>();
            result = Some(landed.inspect(|landed| {
                // 阶段 2 —— 世界已是最终态，这时才投影。跨表数组公式在这里
                // 读到的是新装好的源表，而不是安装到一半的旧世界。
                for (sheet_idx, _, cleanup) in landed {
                    self.sheets[*sheet_idx].finish_bulk_spill_projection(cleanup);
                }
            }));
        });
        let installed = result.expect("workbook install batch closure did not run")?;
        let installed_idxs: Vec<usize> = installed.iter().map(|(idx, _, _)| *idx).collect();
        self.reproject_cross_sheet_arrays_after_install(&installed_idxs);
        let mut stats = Vec::with_capacity(installed.len());
        for (sheet_idx, sheet_stats, cleanup) in installed {
            self.sheets[sheet_idx].finish_bulk_install(cleanup);
            stats.push(sheet_stats);
        }
        Ok(stats)
    }

    pub fn bulk_load<R>(&mut self, f: impl FnOnce(&mut WorkbookLoader<'_>) -> R) -> R {
        // Re-entrancy guard for Wave 8 custom-formula callbacks. We can't
        // refuse cleanly without breaking the signature, so we still let
        // the loader run — but we plumb the guard through to
        // `WorkbookLoader` so each buffered write checks the depth at
        // entry-into-this-API time (NOT at flush time, which always runs
        // in a clean frame). Practically: a custom callback that calls
        // `wb.bulk_load(|l| { l.set_cell(...); })` finds the loader's
        // `set_cell` calls becoming no-ops via the same guard the direct
        // `Workbook::set_cell` honors.
        let mut loader = WorkbookLoader::new(self);
        let result = f(&mut loader);
        loader.flush();
        result
    }
}
