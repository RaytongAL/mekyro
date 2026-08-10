import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Copy, Check, X, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import i18n from "@/i18n";
import { BackendDataSurface } from "@/components/backend-ui/backend-data-surface";
import { BackendCombobox } from "@/components/backend-ui/backend-combobox";
import { BackendPaginationNumbers } from "@/components/backend-ui/backend-pagination";
import { BackendRowActions } from "@/components/backend-ui/backend-row-actions";
import {
  BackendEmptyState,
  BackendErrorState,
  BackendTableSkeleton,
} from "@/components/backend-ui/backend-state-panel";
import { BackendStatusBadge } from "@/components/backend-ui/backend-status-badge";
import { BackendToolbarButton } from "@/components/backend-ui/backend-toolbar-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { BackendPageSizeSelect } from "./backend-select";
import styles from "./ops-shell.module.css";

/* ---------- 权限选项 ---------- */
const PERMISSION_OPTIONS = [
  { value: "lead:read", label: "线索-读", labelEn: "Lead Read" },
  { value: "lead:create", label: "线索-创建", labelEn: "Lead Create" },
  { value: "lead:update", label: "线索-更新", labelEn: "Lead Update" },
  { value: "lead:delete", label: "线索-删除", labelEn: "Lead Delete" },
  { value: "lead_contact_log:read", label: "联系记录-读", labelEn: "Contact Log Read" },
  { value: "lead_contact_log:create", label: "联系记录-创建", labelEn: "Contact Log Create" },
  { value: "lead_contact_log:update", label: "联系记录-更新", labelEn: "Contact Log Update" },
  { value: "lead_contact_log:delete", label: "联系记录-删除", labelEn: "Contact Log Delete" },
  { value: "product:read", label: "商品-读", labelEn: "Product Read" },
  { value: "product:create", label: "商品-创建", labelEn: "Product Create" },
  { value: "product:update", label: "商品-更新", labelEn: "Product Update" },
  { value: "product:delete", label: "商品-删除", labelEn: "Product Delete" },
  { value: "product_inventory:read", label: "库存-读", labelEn: "Inventory Read" },
  { value: "product_inventory:create", label: "库存-创建", labelEn: "Inventory Create" },
  { value: "workspace:read", label: "工作区-读", labelEn: "Workspace Read" },
];

const PAGE_SIZE_OPTIONS = [10, 20, 50];

/* ---------- 类型 ---------- */
type ApiKeyItem = {
  id: number;
  user_id: number;
  username: string;
  workspace_id: number;
  workspace_name: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
};

type WorkspaceOption = {
  workspace_id: number;
  workspace_name: string;
};

function getToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)ai_trade_token=([^;]*)/);
  return match?.[1] ?? null;
}

export function ApiKeysPage() {
  const { t } = useTranslation();
  const locale = i18n.language;

  /* ---- 列表 ---- */
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  /* ---- 工作区 ---- */
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);

  /* ---- 创建抽屉 ---- */
  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState("");
  const [formWorkspaceId, setFormWorkspaceId] = useState("");
  const [formPermissions, setFormPermissions] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [createdKey, setCreatedKey] = useState<{
    name: string;
    key: string;
    key_prefix: string;
  } | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  /* ---- 编辑抽屉 ---- */
  const [editTarget, setEditTarget] = useState<ApiKeyItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editWorkspaceId, setEditWorkspaceId] = useState("");
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");

  /* ---- 删除确认 ---- */
  const [deleteTarget, setDeleteTarget] = useState<ApiKeyItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ---- 状态切换加载中 ---- */
  const [statusToggling, setStatusToggling] = useState<Set<number>>(new Set());

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  /* ==================== 数据获取 ==================== */

  const fetchKeys = useCallback(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }

    setLoading(true);
    setError("");
    fetch(`/api/internal/api-keys/?page=${page}&page_size=${pageSize}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.code === 200 && data.data) {
          setKeys(data.data.keys ?? []);
          setTotal(data.data.total ?? 0);
        } else {
          setError(data?.message ?? t("ops.apiKeysFetchFailed"));
        }
      })
      .catch(() => setError(t("ops.apiKeysFetchFailed")))
      .finally(() => setLoading(false));
  }, [page, pageSize, t]);

  const fetchWorkspaces = useCallback(() => {
    const token = getToken();
    if (!token) return;

    fetch("/api/workspace/list/", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.code === 200 && Array.isArray(data.data?.results)) {
          setWorkspaces(
            data.data.results.map((ws: { workspace_id: number; workspace_name: string }) => ({
              workspace_id: ws.workspace_id,
              workspace_name: ws.workspace_name,
            }))
          );
        }
      })
      .catch(() => { /* ignore */ });
  }, []);

  useEffect(() => {
    fetchKeys();
    fetchWorkspaces();
  }, [fetchKeys, fetchWorkspaces]);

  /* ==================== 创建 ==================== */

  function openCreate() {
    setFormName("");
    setFormWorkspaceId("");
    setFormPermissions([]);
    setFormError("");
    setCreatedKey(null);
    setKeyCopied(false);
    setShowCreate(true);
  }

  function toggleCreatePermission(perm: string) {
    setFormPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  }

  async function handleCreate() {
    if (!formName.trim()) { setFormError(t("ops.apiKeysNameRequired")); return; }
    if (!formWorkspaceId) { setFormError(t("ops.apiKeysWorkspaceRequired")); return; }
    if (formPermissions.length === 0) { setFormError(t("ops.apiKeysPermissionRequired")); return; }

    const token = getToken();
    if (!token) return;

    setCreating(true);
    setFormError("");
    try {
      const res = await fetch("/api/internal/api-keys/create/", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          workspace_id: formWorkspaceId,
          permissions: formPermissions,
        }),
      });
      const data = await res.json();
      if (data?.code === 200 && data.data) {
        setCreatedKey({ name: data.data.name, key: data.data.key, key_prefix: data.data.key_prefix });
        fetchKeys();
      } else {
        setFormError(data?.message ?? t("ops.apiKeysCreateFailed"));
      }
    } catch {
      setFormError(t("ops.apiKeysCreateFailed"));
    } finally {
      setCreating(false);
    }
  }

  function closeCreate() {
    setShowCreate(false);
    setCreatedKey(null);
    setKeyCopied(false);
  }

  async function copyKey() {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey.key);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2500);
    } catch {
      setKeyCopied(true);
    }
  }

  /* ==================== 编辑 ==================== */

  function openEdit(item: ApiKeyItem) {
    setEditTarget(item);
    setEditName(item.name);
    setEditWorkspaceId(String(item.workspace_id));
    setEditPermissions([...item.permissions]);
    setEditError("");
    setEditing(false);
  }

  function toggleEditPermission(perm: string) {
    setEditPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  }

  async function handleEdit() {
    if (!editTarget) return;
    if (!editName.trim()) { setEditError(t("ops.apiKeysNameRequired")); return; }
    if (!editWorkspaceId) { setEditError(t("ops.apiKeysWorkspaceRequired")); return; }
    if (editPermissions.length === 0) { setEditError(t("ops.apiKeysPermissionRequired")); return; }

    const token = getToken();
    if (!token) return;

    setEditing(true);
    setEditError("");
    try {
      const res = await fetch(`/api/internal/api-keys/${editTarget.id}/update/`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          workspace_id: editWorkspaceId,
          permissions: editPermissions,
        }),
      });
      const data = await res.json();
      if (data?.code === 200) {
        setEditTarget(null);
        fetchKeys();
      } else {
        setEditError(data?.message ?? t("ops.apiKeysUpdateFailed"));
      }
    } catch {
      setEditError(t("ops.apiKeysUpdateFailed"));
    } finally {
      setEditing(false);
    }
  }

  /* ==================== 状态切换 ==================== */

  async function toggleStatus(item: ApiKeyItem) {
    const token = getToken();
    if (!token) return;

    setStatusToggling((prev) => new Set(prev).add(item.id));
    try {
      const res = await fetch(`/api/internal/api-keys/${item.id}/status/`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !item.is_active }),
      });
      const data = await res.json();
      if (data?.code === 200) {
        setKeys((prev) =>
          prev.map((k) => (k.id === item.id ? { ...k, is_active: !item.is_active } : k))
        );
      }
    } catch {
      /* ignore */
    } finally {
      setStatusToggling((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }

  /* ==================== 删除 ==================== */

  async function confirmDelete() {
    if (!deleteTarget) return;
    const token = getToken();
    if (!token) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/internal/api-keys/${deleteTarget.id}/delete/`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data?.code === 200) {
        setKeys((prev) => prev.filter((k) => k.id !== deleteTarget.id));
        setTotal((prev) => prev - 1);
      }
    } catch {
      /* ignore */
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  /* ==================== 分页 ==================== */

  function goPage(p: number) {
    setPage(Math.max(1, Math.min(p, totalPages)));
  }

  function changePageSize(size: number) {
    setPageSize(size);
    setPage(1);
  }

  /* ==================== 渲染辅助 ==================== */

  function formatDatetime(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(locale);
  }

  const permissionLabel = (perm: string) => {
    const opt = PERMISSION_OPTIONS.find((o) => o.value === perm);
    return opt ? (locale === "zh-CN" ? opt.label : opt.labelEn) : perm;
  };

  /* ==================== 权限复选框组件 ==================== */

  function PermissionCheckboxes({
    selected,
    onChange,
  }: {
    selected: string[];
    onChange: (perm: string) => void;
  }) {
    return (
      <div className={styles.permissionCheckboxGrid}>
        {PERMISSION_OPTIONS.map((opt) => {
          const checked = selected.includes(opt.value);
          return (
            <label
              key={opt.value}
              className={checked ? styles.permissionChipChecked : styles.permissionChip}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => onChange(opt.value)}
                className={styles.permissionCheckbox}
              />
              {locale === "zh-CN" ? opt.label : opt.labelEn}
            </label>
          );
        })}
      </div>
    );
  }

  /* ==================== JSX ==================== */

  return (
    <div className={`${styles.whiteCard} ${styles.dataPage}`}>
      <div className={styles.pageActions}>
        <BackendToolbarButton onClick={openCreate}>
          <Plus size={14} data-icon="inline-start" />
          {t("ops.apiKeysCreate")}
        </BackendToolbarButton>
      </div>

      <BackendDataSurface
        footer={(!loading && !error && keys.length > 0) ? (
          <div className={styles.pagination}>
            <span className={styles.paginationInfo}>
              {t("ops.apiKeysPaginationInfo", { total, page, totalPages })}
            </span>
            <div className={styles.paginationControls}>
              <BackendPageSizeSelect
                label={t("ops.apiKeysPerPage")}
                value={pageSize}
                options={PAGE_SIZE_OPTIONS}
                onChange={changePageSize}
              />
              <button
                className={styles.pageBtn}
                disabled={page <= 1}
                onClick={() => goPage(page - 1)}
              >
                <ChevronLeft size={14} />
              </button>
              <BackendPaginationNumbers page={page} totalPages={totalPages} onPageChange={goPage} />
              <button
                className={styles.pageBtn}
                disabled={page >= totalPages}
                onClick={() => goPage(page + 1)}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        ) : undefined}
      >
        {loading ? (
        <BackendTableSkeleton label={t("common.loading")} />
      ) : error ? (
        <BackendErrorState title={error} />
      ) : keys.length === 0 ? (
        <BackendEmptyState title={t("ops.apiKeysEmpty")} />
      ) : (
          <div className={styles.tableWrapper}>
            <Table className={`${styles.dataTable} ${styles.actionColumnTable} ${styles.compactActionColumn} ${styles.apiKeysTable}`}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ops.apiKeysColPrefix")}</TableHead>
                  <TableHead>{t("ops.apiKeysColName")}</TableHead>
                  <TableHead>{t("ops.apiKeysColWorkspace")}</TableHead>
                  <TableHead>{t("ops.apiKeysColPermissions")}</TableHead>
                  <TableHead>{t("ops.apiKeysColStatus")}</TableHead>
                  <TableHead>{t("ops.apiKeysColLastUsed")}</TableHead>
                  <TableHead>{t("ops.apiKeysColCreated")}</TableHead>
                  <TableHead>{t("ops.apiKeysColActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <code className={styles.keyPrefixCode}>{item.key_prefix}</code>
                    </TableCell>
                    <TableCell><strong>{item.name}</strong></TableCell>
                    <TableCell style={{ color: "var(--text-secondary)" }}>{item.workspace_name}</TableCell>
                    <TableCell>
                      <div className={styles.permissionTags}>
                        {item.permissions.map((p) => (
                          <span key={p} className={styles.permissionTag}>
                            {permissionLabel(p)}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className={styles.statusToggleButton}
                        onClick={() => toggleStatus(item)}
                        disabled={statusToggling.has(item.id)}
                      >
                        <BackendStatusBadge tone={item.is_active ? "success" : "neutral"}>
                          {statusToggling.has(item.id) ? (
                            <Loader2 size={12} className={styles.spinIcon} />
                          ) : null}
                          {item.is_active ? t("ops.apiKeysActive") : t("ops.apiKeysInactive")}
                        </BackendStatusBadge>
                      </button>
                    </TableCell>
                    <TableCell style={{ color: "var(--text-tertiary)", fontSize: 12, whiteSpace: "nowrap" }}>
                      {formatDatetime(item.last_used_at)}
                    </TableCell>
                    <TableCell style={{ color: "var(--text-tertiary)", fontSize: 12, whiteSpace: "nowrap" }}>
                      {formatDatetime(item.created_at)}
                    </TableCell>
                    <TableCell>
                      <BackendRowActions
                        label={t("common.moreActions")}
                        items={[
                          { label: t("ops.apiKeysEdit"), onSelect: () => openEdit(item) },
                          {
                            label: t("ops.apiKeysDelete"),
                            onSelect: () => setDeleteTarget(item),
                            tone: "destructive",
                            disabled: item.is_active,
                            hint: item.is_active ? t("ops.apiKeysDeleteDisabledHint") : undefined,
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
      )}
      </BackendDataSurface>

      {/* ==================== 创建抽屉 ==================== */}
      <Sheet open={showCreate} onOpenChange={(open) => { if (!open) closeCreate(); }}>
        <SheetContent side="right" className={styles.opsDrawerContent}>
          {!createdKey ? (
            <>
              <SheetHeader>
                <SheetTitle>{t("ops.apiKeysCreateTitle")}</SheetTitle>
                <SheetDescription>{t("ops.apiKeysCreateDesc")}</SheetDescription>
              </SheetHeader>
              <div className={styles.drawerBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>{t("ops.apiKeysFormName")}</label>
                  <Input
                    type="text"
                    className={styles.formInput}
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={t("ops.apiKeysFormNamePlaceholder")}
                    maxLength={100}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>{t("ops.apiKeysFormWorkspace")}</label>
                  <BackendCombobox
                    aria-label={t("ops.apiKeysFormWorkspace")}
                    value={formWorkspaceId}
                    onChange={setFormWorkspaceId}
                    options={workspaces.map((workspace) => ({
                      value: String(workspace.workspace_id),
                      label: workspace.workspace_name,
                      searchText: workspace.workspace_name,
                    }))}
                    emptyLabel={t("ops.comboboxNoResults")}
                    placeholder={t("ops.apiKeysFormWorkspacePlaceholder")}
                    variant="form"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>{t("ops.apiKeysFormPermissions")}</label>
                  <PermissionCheckboxes selected={formPermissions} onChange={toggleCreatePermission} />
                </div>
                {formError ? <p className={styles.formError}>{formError}</p> : null}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeCreate} disabled={creating}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? <Loader2 size={14} className={styles.spinIcon} /> : null}
                  {t("ops.apiKeysConfirmCreate")}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle>{t("ops.apiKeysCreatedTitle")}</SheetTitle>
                <SheetDescription>{t("ops.apiKeysCreatedDesc")}</SheetDescription>
              </SheetHeader>
              <div className={styles.keyRevealBox}>
                <div className={styles.keyRevealLabel}>
                  {t("ops.apiKeysCreatedName")}: {createdKey.name}
                </div>
                <div className={styles.keyRevealLabel}>
                  {t("ops.apiKeysColPrefix")}: {createdKey.key_prefix}
                </div>
                <div className={styles.keyRevealValue}>
                  <code>{createdKey.key}</code>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button type="button" className={styles.copyBtn} onClick={copyKey} />
                      }
                    >
                      {keyCopied ? <Check size={14} /> : <Copy size={14} />}
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {keyCopied ? t("ops.apiKeysCopied") : t("ops.apiKeysCopy")}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={closeCreate}>{t("common.close")}</Button>
              </DialogFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ==================== 编辑抽屉 ==================== */}
      <Sheet open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <SheetContent side="right" className={styles.opsDrawerContent}>
          <SheetHeader>
            <SheetTitle>{t("ops.apiKeysEditTitle")}</SheetTitle>
            <SheetDescription>{t("ops.apiKeysEditDesc", { name: editTarget?.name ?? "" })}</SheetDescription>
          </SheetHeader>
          <div className={styles.drawerBody}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.apiKeysFormName")}</label>
              <Input
                type="text"
                className={styles.formInput}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.apiKeysFormWorkspace")}</label>
              <BackendCombobox
                aria-label={t("ops.apiKeysFormWorkspace")}
                value={editWorkspaceId}
                onChange={setEditWorkspaceId}
                options={workspaces.map((workspace) => ({
                  value: String(workspace.workspace_id),
                  label: workspace.workspace_name,
                  searchText: workspace.workspace_name,
                }))}
                emptyLabel={t("ops.comboboxNoResults")}
                placeholder={t("ops.apiKeysFormWorkspacePlaceholder")}
                variant="form"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.apiKeysFormPermissions")}</label>
              <PermissionCheckboxes selected={editPermissions} onChange={toggleEditPermission} />
            </div>
            {editError ? <p className={styles.formError}>{editError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editing}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleEdit} disabled={editing}>
              {editing ? <Loader2 size={14} className={styles.spinIcon} /> : null}
              {t("ops.apiKeysConfirmEdit")}
            </Button>
          </DialogFooter>
        </SheetContent>
      </Sheet>

      {/* ==================== 删除确认对话框 ==================== */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className={styles.createDialog} showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("ops.apiKeysDeleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("ops.apiKeysDeleteConfirm", { name: deleteTarget?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Loader2 size={14} className={styles.spinIcon} /> : null}
              {t("ops.apiKeysConfirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
