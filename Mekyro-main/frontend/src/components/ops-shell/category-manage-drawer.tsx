import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Loader2, Plus, Trash2 } from "lucide-react";
import i18n from "@/i18n";
import { BackendCombobox } from "@/components/backend-ui/backend-combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TruncatedCell } from "./truncated-cell";
import { useWorkspace } from "./workspace-context";
import { buildCategoryPath, categoryDepth } from "./category-tree";

import styles from "./ops-shell.module.css";

type CategoryItem = {
  id: number;
  workspace_id: number;
  name: string;
  parent_id: number | null;
  sort_order: number;
  created_at: string;
};

function getToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)ai_trade_token=([^;]*)/);
  return match?.[1] ?? null;
}

/** candidateId 是否是 ancestorId 自身或其后代（用于编辑父分类时排除成环）。 */
function isSelfOrDescendant(cats: CategoryItem[], candidateId: number, ancestorId: number): boolean {
  let curId: number | null = candidateId;
  const visited = new Set<number>();
  while (curId != null && !visited.has(curId)) {
    if (curId === ancestorId) return true;
    visited.add(curId);
    curId = cats.find((c) => c.id === curId)?.parent_id ?? null;
  }
  return false;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
  apiBase?: string;
};

export function CategoryManageDrawer({ open, onOpenChange, onChanged, apiBase }: Props) {
  const { t } = useTranslation();
  const locale = i18n.language;
  const { selectedWorkspaceId } = useWorkspace();
  const api = apiBase || "/api/internal";
  const isSupplier = !!apiBase;

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [editTarget, setEditTarget] = useState<CategoryItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editParentId, setEditParentId] = useState("");
  const [editSortOrder, setEditSortOrder] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createParentId, setCreateParentId] = useState("");
  const [createSortOrder, setCreateSortOrder] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<CategoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCategories = useCallback(() => {
    if (!selectedWorkspaceId && !isSupplier) return;
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (!isSupplier) params.set("workspace_id", selectedWorkspaceId);
    fetch(`${api}/categories/?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.code === 200 && data.data) {
          setCategories(Array.isArray(data.data) ? data.data : data.data.results ?? []);
        }
        else setError(data?.message ?? t("ops.categoriesFetchFailed"));
      })
      .catch(() => setError(t("ops.categoriesFetchFailed")))
      .finally(() => setLoading(false));
  }, [selectedWorkspaceId, t]);

  useEffect(() => {
    if (open) fetchCategories();
  }, [open, fetchCategories]);

  function notifyChanged() {
    fetchCategories();
    onChanged?.();
  }

  function openCreate() {
    setCreateName("");
    setCreateParentId("");
    setCreateSortOrder(0);
    setCreateError("");
    setCreateOpen(true);
  }

  async function handleCreate() {
    if (!selectedWorkspaceId && !isSupplier) return;
    const token = getToken();
    if (!token) return;
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch(`${api}/categories/create/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName,
          parent_id: createParentId ? Number(createParentId) : null,
          ...(isSupplier ? {} : { workspace_id: selectedWorkspaceId }),
          sort_order: createSortOrder,
        }),
      });
      const data = await res.json();
      if (data?.code === 200) {
        setCreateOpen(false);
        notifyChanged();
      } else {
        setCreateError(data?.message ?? t("ops.categoriesCreateFailed"));
      }
    } catch {
      setCreateError(t("ops.categoriesCreateFailed"));
    } finally {
      setCreating(false);
    }
  }

  function openEdit(item: CategoryItem) {
    setEditTarget(item);
    setEditName(item.name);
    setEditParentId(item.parent_id ? String(item.parent_id) : "");
    setEditSortOrder(item.sort_order);
    setEditError("");
  }

  async function handleEdit() {
    if (!editTarget) return;
    const token = getToken();
    if (!token) return;
    setEditing(true);
    setEditError("");
    try {
      const res = await fetch(`${api}/categories/${editTarget.id}/update/`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          parent_id: editParentId ? Number(editParentId) : null,
          sort_order: editSortOrder,
        }),
      });
      const data = await res.json();
      if (data?.code === 200) {
        setEditTarget(null);
        notifyChanged();
      } else {
        setEditError(data?.message ?? t("ops.categoriesUpdateFailed"));
      }
    } catch {
      setEditError(t("ops.categoriesUpdateFailed"));
    } finally {
      setEditing(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const token = getToken();
    if (!token) return;
    setDeleting(true);
    try {
      const res = await fetch(`${api}/categories/${deleteTarget.id}/delete/`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data?.code === 200) {
        setCategories((p) => p.filter((x) => x.id !== deleteTarget.id));
        onChanged?.();
      }
    } catch {
      /* ignore */
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  function formatDatetime(iso: string): string {
    return iso ? new Date(iso).toLocaleString(locale) : "—";
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={styles.opsDrawerContent}>
        <SheetHeader className={styles.categoryDrawerHeader}>
          <SheetTitle>{t("ops.categoryManage")}</SheetTitle>
          <SheetDescription>{t("ops.categoriesCreateDesc")}</SheetDescription>
        </SheetHeader>

        <div className={styles.categoryDrawerBody}>
          <div className={styles.categoryDrawerToolbar}>
            <Button size="sm" onClick={openCreate}>
              <Plus size={14} aria-hidden="true" />
              {t("ops.categoriesCreate")}
            </Button>
          </div>

          {loading ? (
            <p className={styles.loadingText}>{t("common.loading")}</p>
          ) : error ? (
            <p className={styles.loadingText}>{error}</p>
          ) : categories.length === 0 ? (
            <p className={styles.emptyText}>{t("ops.categoriesEmpty")}</p>
          ) : (
            <div className={styles.tableWrapper}>
              <Table className={`${styles.dataTable} ${styles.actionColumnTable} ${styles.wideActionColumn} ${styles.categoryTable}`}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("ops.categoriesColName")}</TableHead>
                    <TableHead>{t("ops.categoriesColParent")}</TableHead>
                    <TableHead>{t("ops.categoriesColSort")}</TableHead>
                    <TableHead>{t("ops.apiKeysColActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell><TruncatedCell>{item.name}</TruncatedCell></TableCell>
                      <TableCell><TruncatedCell>{buildCategoryPath(categories, item.parent_id)}</TruncatedCell></TableCell>
                      <TableCell>{item.sort_order}</TableCell>
                      <TableCell>
                        <div className={styles.actionButtons}>
                          <Button type="button" variant="outline" size="sm" className={styles.tableActionButton} onClick={() => openEdit(item)}>
                            <Pencil data-icon="inline-start" />
                            {t("ops.apiKeysEdit")}
                          </Button>
                          <Button type="button" variant="outline" size="sm" className={`${styles.tableActionButton} ${styles.tableActionDanger}`} onClick={() => setDeleteTarget(item)}>
                            <Trash2 data-icon="inline-start" />
                            {t("ops.apiKeysDelete")}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* 创建 */}
        <Dialog open={createOpen} onOpenChange={(o) => { if (!o) setCreateOpen(false); }}>
          <DialogContent className={styles.createDialog}>
            <DialogHeader>
              <DialogTitle>{t("ops.categoriesCreateTitle")}</DialogTitle>
              <DialogDescription>{t("ops.categoriesCreateDesc")}</DialogDescription>
            </DialogHeader>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.categoriesColName")}</label>
              <Input type="text" className={styles.formInput} value={createName} onChange={(e) => setCreateName(e.target.value)} maxLength={100} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.categoriesColParent")}</label>
              <BackendCombobox
                aria-label={t("ops.categoriesColParent")}
                value={createParentId}
                onChange={setCreateParentId}
                options={[
                  { value: "", label: t("ops.productsNoCategory") },
                  ...categories
                    .filter((category) => categoryDepth(categories, category.id) <= 4)
                    .map((category) => ({
                      value: String(category.id),
                      label: buildCategoryPath(categories, category.id),
                      searchText: buildCategoryPath(categories, category.id),
                    })),
                ]}
                emptyLabel={t("ops.comboboxNoResults")}
                placeholder={t("ops.productsNoCategory")}
                variant="form"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.categoriesColSort")}</label>
              <Input type="number" className={styles.formInput} value={createSortOrder} onChange={(e) => setCreateSortOrder(Number(e.target.value))} />
            </div>
            {createError ? <p className={styles.formError}>{createError}</p> : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>{t("common.cancel")}</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 size={14} className={styles.spinIcon} /> : null}
                {t("ops.categoriesConfirmCreate")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 编辑 */}
        <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
          <DialogContent className={styles.createDialog}>
            <DialogHeader>
              <DialogTitle>{t("ops.categoriesEditTitle")}</DialogTitle>
              <DialogDescription>{editTarget?.name} (#{editTarget?.id})</DialogDescription>
            </DialogHeader>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.categoriesColName")}</label>
              <Input type="text" className={styles.formInput} value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={100} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.categoriesColParent")}</label>
              <BackendCombobox
                aria-label={t("ops.categoriesColParent")}
                value={editParentId}
                onChange={setEditParentId}
                options={[
                  { value: "", label: t("ops.productsNoCategory") },
                  ...categories
                    .filter((category) =>
                      categoryDepth(categories, category.id) <= 4 &&
                      (!editTarget || !isSelfOrDescendant(categories, category.id, editTarget.id)),
                    )
                    .map((category) => ({
                      value: String(category.id),
                      label: buildCategoryPath(categories, category.id),
                      searchText: buildCategoryPath(categories, category.id),
                    })),
                ]}
                emptyLabel={t("ops.comboboxNoResults")}
                placeholder={t("ops.productsNoCategory")}
                variant="form"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.categoriesColSort")}</label>
              <Input type="number" className={styles.formInput} value={editSortOrder} onChange={(e) => setEditSortOrder(Number(e.target.value))} />
            </div>
            {editError ? <p className={styles.formError}>{editError}</p> : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editing}>{t("common.cancel")}</Button>
              <Button onClick={handleEdit} disabled={editing}>
                {editing ? <Loader2 size={14} className={styles.spinIcon} /> : null}
                {t("ops.apiKeysConfirmEdit")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 删除 */}
        <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
          <DialogContent className={styles.createDialog} showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>{t("ops.categoriesDeleteTitle")}</DialogTitle>
              <DialogDescription>{t("ops.categoriesDeleteConfirm", { name: deleteTarget?.name ?? "" })}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>{t("common.cancel")}</Button>
              <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
                {deleting ? <Loader2 size={14} className={styles.spinIcon} /> : null}
                {t("ops.apiKeysConfirmDelete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
