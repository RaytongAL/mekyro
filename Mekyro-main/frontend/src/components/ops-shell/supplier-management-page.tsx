import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Loader2, Plus, UserRound, ChevronLeft, ChevronRight } from "lucide-react";
import i18n from "@/i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { api, type ApiResponse } from "@/lib/api";
import { BackendRowActions } from "@/components/backend-ui/backend-row-actions";
import { BackendToolbarButton } from "@/components/backend-ui/backend-toolbar-button";
import { BackendPageSizeSelect } from "./backend-select";
import { TruncatedCell } from "./truncated-cell";
import { SortButton } from "./sort-button";
import styles from "./ops-shell.module.css";

/* ---------- 类型 ---------- */

type WorkspaceMember = {
  user_id: number;
  username: string;
  nickname: string;
  phone: string;
  email: string;
  user_is_active: boolean;
  is_superuser: boolean;
  ws_user_name: string;
  role: string;
};

type ShopifyConfigData = {
  config_id: number | null;
  workspace_id: number;
  store_url: string;
  api_key: string;
  api_secret_key: string;
  has_config: boolean;
  is_active: boolean;
};

type WorkspaceItem = {
  workspace_id: number;
  workspace_name: string;
  description: string;
  site_type: string;
  prompt: string;
  daily_lead_limit: number;
  is_active: boolean;
  created_at: string;
  members: WorkspaceMember[];
  shopify_config?: ShopifyConfigData | null;
};

type SupplierAccountDetail = {
  workspace_id: number;
  workspace_name: string;
  description: string;
  site_type: string;
  prompt: string;
  daily_lead_limit: number;
  vendure_channels_token: string;
  vendure_url: string;
  is_active: boolean;
  created_at: string;
  user_id: number;
  username: string;
  phone: string;
  email: string;
  user_is_active: boolean;
  ws_user_name: string;
  ws_user_role: string;
};

type CreatedAccount = {
  workspace_id: number;
  workspace_name: string;
  user_id: number;
  username: string;
  ws_user_name: string;
  password: string;
};

/* ---------- 工具 ---------- */

function formatDatetime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(i18n.language);
  } catch {
    return iso;
  }
}

function roleLabel(role: string, locale: string): string {
  if (role === "owner") return locale === "zh-CN" ? "负责人" : "Owner";
  if (role === "admin") return locale === "zh-CN" ? "管理员" : "Admin";
  return role;
}

/* ---------- 表单默认值 ---------- */

const EMPTY_CREATE_FORM = {
  username: "",
  phone: "",
  email: "",
  workspace_name: "",
  contact_name: "",
  prompt: "",
  daily_lead_limit: 0,
};

const EMPTY_EDIT_FORM = {
  phone: "",
  email: "",
  user_is_active: true,
  workspace_name: "",
  workspace_is_active: true,
  contact_name: "",
  role: "owner" as "owner" | "admin",
  site_type: "",
  store_url: "",
  api_key: "",
  api_secret_key: "",
  vendure_channels_token: "",
  vendure_url: "",
  prompt: "",
  daily_lead_limit: 0,
};

/* ---------- 组件 ---------- */

export function SupplierManagementPage() {
  const { t } = useTranslation();
  const locale = i18n.language;

  /* ---- 列表 ---- */
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [ordering, setOrdering] = useState("-id");

  /* ---- 创建抽屉 ---- */
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_CREATE_FORM });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdAccount, setCreatedAccount] = useState<CreatedAccount | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);

  /* ---- 编辑抽屉 ---- */
  const [editTarget, setEditTarget] = useState<WorkspaceItem | null>(null);
  const [editDetail, setEditDetail] = useState<SupplierAccountDetail | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editForm, setEditForm] = useState({ ...EMPTY_EDIT_FORM });
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");
  const [shopifyConfigId, setShopifyConfigId] = useState<number | null>(null);
  const [shopifyConfigActive, setShopifyConfigActive] = useState(false);
  const [shopifyActing, setShopifyActing] = useState(false);
  const [editTab, setEditTab] = useState("basic");

  /* ---- 停用确认 ---- */
  const [disableTarget, setDisableTarget] = useState<WorkspaceItem | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [enablingWorkspaceId, setEnablingWorkspaceId] = useState<number | null>(null);

  /* ---- 删除确认 ---- */
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ---- 加载列表 ---- */
  const fetchList = useCallback(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
      ordering,
    });
    if (includeInactive) params.set("include_inactive", "true");

    // 并行请求供应商列表和 Shopify 配置列表
    Promise.all([
      api<ApiResponse<{ total: number; results: WorkspaceItem[] }>>(`/api/workspace/list/?${params.toString()}`),
      api<ApiResponse<{ configs: ShopifyConfigData[]; total: number }>>("/api/internal/shopify-configs/?page=1&page_size=200"),
    ])
      .then(([wsData, shopifyData]) => {
        if (wsData?.code === 200 && wsData.data) {
          // 合并 Shopify 配置到供应商列表
          const configMap = new Map<number, ShopifyConfigData>();
          if (shopifyData?.code === 200 && shopifyData.data?.configs) {
            shopifyData.data.configs.forEach((c) => configMap.set(c.workspace_id, c));
          }

          const mergedWorkspaces = (wsData.data.results ?? []).map((ws) => ({
            ...ws,
            shopify_config: configMap.get(ws.workspace_id) ?? null,
          }));

          setWorkspaces(mergedWorkspaces);
          setTotal(wsData.data.total ?? 0);
        } else {
          setError(t("ops.supplierAccountsFetchFailed"));
        }
      })
      .catch(() => setError(t("ops.supplierAccountsFetchFailed")))
      .finally(() => setLoading(false));
  }, [includeInactive, page, pageSize, ordering, t]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  function goPage(p: number) { setPage(Math.max(1, Math.min(p, totalPages))); }

  /* ---- 创建 ---- */
  function openCreate() {
    setCreateForm({ ...EMPTY_CREATE_FORM });
    setCreateError("");
    setCreatedAccount(null);
    setPasswordCopied(false);
    setShowCreate(true);
  }

  function closeCreate() {
    setShowCreate(false);
  }

  async function handleCreate() {
    const { username, phone, email, workspace_name, contact_name } = createForm;
    if (!username) { setCreateError(t("ops.supplierAccountsUsernameRequired")); return; }
    if (!phone) { setCreateError(t("ops.supplierAccountsPhoneRequired")); return; }
    if (!email) { setCreateError(t("ops.supplierAccountsEmailRequired")); return; }
    if (!workspace_name) { setCreateError(t("ops.supplierAccountsWorkspaceNameRequired")); return; }
    if (!contact_name) { setCreateError(t("ops.supplierAccountsContactNameRequired")); return; }

    setCreating(true);
    setCreateError("");

    try {
      const data = await api<ApiResponse<CreatedAccount>>("/api/workspace/create/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      if (data?.code === 200 && data.data) {
        setCreatedAccount(data.data);
        fetchList();
      } else {
        setCreateError(data?.message ?? t("ops.supplierAccountsCreateFailed"));
      }
    } catch {
      setCreateError(t("ops.supplierAccountsCreateFailed"));
    } finally {
      setCreating(false);
    }
  }

  function copyPassword() {
    if (!createdAccount?.password) return;
    navigator.clipboard.writeText(createdAccount.password).then(() => {
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 2000);
    }).catch(() => {});
  }

  /* ---- 编辑 ---- */
  async function openEdit(ws: WorkspaceItem) {
    setEditTarget(ws);
    setEditDetail(null);
    setEditLoading(true);
    setEditError("");
    setShopifyConfigId(null);
    setShopifyConfigActive(false);
    setEditTab("basic");
    setEditForm({ ...EMPTY_EDIT_FORM, workspace_name: ws.workspace_name, workspace_is_active: ws.is_active });

    try {
      // 并行请求供应商详情和 Shopify 配置列表
      const [detailRes, shopifyRes] = await Promise.all([
        api<ApiResponse<SupplierAccountDetail>>(`/api/workspace/${ws.workspace_id}/detail/`),
        api<ApiResponse<{ configs: ShopifyConfigData[] }>>("/api/internal/shopify-configs/?page=1&page_size=200"),
      ]);

      if (detailRes?.code === 200 && detailRes.data) {
        const d = detailRes.data;
        setEditDetail(d);
        setEditForm({
          phone: d.phone,
          email: d.email,
          user_is_active: d.user_is_active,
          workspace_name: d.workspace_name,
          workspace_is_active: d.is_active,
          contact_name: d.ws_user_name,
          role: d.ws_user_role as "owner" | "admin",
          site_type: d.site_type || "",
          store_url: "",
          api_key: "",
          api_secret_key: "",
          vendure_channels_token: d.vendure_channels_token || "",
          vendure_url: d.vendure_url || "",
          prompt: d.prompt || "",
          daily_lead_limit: d.daily_lead_limit || 0,
        });

        // 加载 Shopify 配置
        if (shopifyRes?.code === 200 && shopifyRes.data?.configs) {
          const config = shopifyRes.data.configs.find((c: ShopifyConfigData) => c.workspace_id === ws.workspace_id) || null;
          if (config) {
            setShopifyConfigId(config.config_id);
            setShopifyConfigActive(config.is_active);
            setEditForm((f) => ({
              ...f,
              store_url: config.store_url || "",
              api_key: config.api_key || "",
              api_secret_key: config.api_secret_key || "",
            }));
          }
        }
      } else {
        setEditError(detailRes?.message ?? t("ops.supplierAccountsFetchFailed"));
      }
    } catch {
      setEditError(t("ops.supplierAccountsFetchFailed"));
    } finally {
      setEditLoading(false);
    }
  }

  async function handleEdit() {
    if (!editTarget || !editDetail) return;
    setEditing(true);
    setEditError("");

    const body: Record<string, string | boolean | number> = {};
    if (editForm.phone !== editDetail.phone) body.phone = editForm.phone;
    if (editForm.email !== editDetail.email) body.email = editForm.email;
    if (editForm.user_is_active !== editDetail.user_is_active) body.user_is_active = editForm.user_is_active;
    if (editForm.workspace_name !== editDetail.workspace_name) body.workspace_name = editForm.workspace_name;
    if (editForm.workspace_is_active !== editDetail.is_active) body.workspace_is_active = editForm.workspace_is_active;
    if (editForm.contact_name !== editDetail.ws_user_name) body.contact_name = editForm.contact_name;
    if (editForm.role !== editDetail.ws_user_role) body.role = editForm.role;
    if (editForm.site_type !== (editDetail.site_type || "")) body.site_type = editForm.site_type;
    if (editForm.prompt !== (editDetail.prompt || "")) body.prompt = editForm.prompt;
    if (editForm.daily_lead_limit !== (editDetail.daily_lead_limit || 0)) body.daily_lead_limit = editForm.daily_lead_limit;
    if (editForm.site_type === "independent") {
      if (editForm.vendure_channels_token !== (editDetail.vendure_channels_token || "")) body.vendure_channels_token = editForm.vendure_channels_token;
      if (editForm.vendure_url !== (editDetail.vendure_url || "")) body.vendure_url = editForm.vendure_url;
    }

    try {
      // 1. 更新供应商信息
      if (Object.keys(body).length > 0) {
        const wsData = await api<ApiResponse<null>>(`/api/workspace/${editTarget.workspace_id}/update/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (wsData?.code !== 200) {
          setEditError(wsData?.message ?? t("ops.supplierAccountsUpdateFailed"));
          setEditing(false);
          return;
        }
      }

      // 2. 如果选择了 Shopify，保存/更新 Shopify 配置
      if (editForm.site_type === "shopify") {
        const shopifyBody: Record<string, string | number> = {
          store_url: editForm.store_url,
          api_key: editForm.api_key,
          api_secret_key: editForm.api_secret_key,
        };
        let shopifyUrl: string;
        let shopifyMethod: string;

        if (shopifyConfigId) {
          shopifyUrl = `/api/internal/shopify-configs/${shopifyConfigId}/update/`;
          shopifyMethod = "PATCH";
        } else {
          shopifyUrl = "/api/internal/shopify-configs/create/";
          shopifyMethod = "POST";
          shopifyBody.workspace_id = editTarget.workspace_id;
        }

        const shopifyData = await api<ApiResponse<null>>(shopifyUrl, {
          method: shopifyMethod,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(shopifyBody),
        });
        if (shopifyData?.code !== 200) {
          setEditError(shopifyData?.message ?? "Shopify config save failed");
          setEditing(false);
          return;
        }
      }

      setEditTarget(null);
      fetchList();
    } catch {
      setEditError(t("ops.supplierAccountsUpdateFailed"));
    } finally {
      setEditing(false);
    }
  }

  async function updateShopifyStatus(isActive: boolean) {
    if (!shopifyConfigId) return;
    setShopifyActing(true);
    setEditError("");
    try {
      const data = await api<ApiResponse<ShopifyConfigData>>(`/api/internal/shopify-configs/${shopifyConfigId}/status/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive }),
      });
      if (data?.code === 200) {
        setShopifyConfigActive(isActive);
        fetchList();
      } else {
        setEditError(data?.message ?? (locale === "zh-CN" ? "Shopify 状态更新失败" : "Shopify status update failed"));
      }
    } finally {
      setShopifyActing(false);
    }
  }

  async function deleteShopifyConfig() {
    if (!shopifyConfigId || shopifyConfigActive) return;
    setShopifyActing(true);
    setEditError("");
    try {
      const data = await api<ApiResponse<null>>(`/api/internal/shopify-configs/${shopifyConfigId}/delete/`, { method: "DELETE" });
      if (data?.code === 200) {
        setShopifyConfigId(null);
        setShopifyConfigActive(false);
        setEditForm((form) => ({ ...form, store_url: "", api_key: "", api_secret_key: "" }));
        fetchList();
      } else {
        setEditError(data?.message ?? (locale === "zh-CN" ? "Shopify 配置删除失败" : "Shopify config deletion failed"));
      }
    } finally {
      setShopifyActing(false);
    }
  }

  /* ---- 停用 ---- */
  async function confirmDisable() {
    if (!disableTarget) return;
    setDisabling(true);
    try {
      const data = await api<ApiResponse<null>>(`/api/workspace/${disableTarget.workspace_id}/delete/`, {
        method: "DELETE",
      });
      if (data?.code === 200) {
        setDisableTarget(null);
        fetchList();
      }
    } finally {
      setDisabling(false);
    }
  }

  async function enableWorkspace(ws: WorkspaceItem) {
    setEnablingWorkspaceId(ws.workspace_id);
    try {
      const data = await api<ApiResponse<null>>(`/api/workspace/${ws.workspace_id}/update/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_is_active: true, user_is_active: true }),
      });
      if (data?.code === 200) fetchList();
    } finally {
      setEnablingWorkspaceId(null);
    }
  }

  /* ---- 硬删除 ---- */
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const data = await api<ApiResponse<null>>(`/api/workspace/${deleteTarget.workspace_id}/delete/?hard=true`, {
        method: "DELETE",
      });
      if (data?.code === 200) {
        setDeleteTarget(null);
        fetchList();
      }
    } finally {
      setDeleting(false);
    }
  }

  /* ---- JSX ---- */

  return (
    <div className={`${styles.whiteCard} ${styles.dataPage}`}>
      <div className={styles.listPageToolbar}>
        <label className={styles.filterChip}>
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => { setIncludeInactive(e.target.checked); setPage(1); }}
          />
          {includeInactive ? t("ops.supplierAccountsFilterAll") : t("ops.supplierAccountsFilterActive")}
        </label>
        <BackendToolbarButton onClick={openCreate}>
          <Plus data-icon="inline-start" />
          {t("ops.supplierAccountsCreate")}
        </BackendToolbarButton>
      </div>

      {/* 内容 */}
      {loading ? (
        <p className={styles.loadingText}>{t("common.loading")}</p>
      ) : error || workspaces.length === 0 ? (
        <Empty className={styles.listPageEmpty}>
          <EmptyMedia variant="icon">
            <UserRound aria-hidden="true" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{t("ops.supplierAccountsEmpty")}</EmptyTitle>
            <EmptyDescription>{t("ops.supplierAccountsEmptyDesc")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className={styles.tableWrapper}>
          <Table className={`${styles.dataTable} ${styles.actionColumnTable} ${styles.compactActionColumn} ${styles.supplierManagementTable}`}>
            <TableHeader>
              <TableRow>
                <TableHead><SortButton label="ID" ordering={ordering} showIndicator={false} onOrderingChange={(v) => { setOrdering(v); setPage(1); }} /></TableHead>
                <TableHead>{t("ops.headerUsername")}</TableHead>
                <TableHead>{t("ops.headerCompany")}</TableHead>
                <TableHead>{t("ops.headerOwner")}</TableHead>
                <TableHead>{t("ops.supplierAccountsFormRole")}</TableHead>
                <TableHead>{t("ops.supplierAccountsHeaderPhone")}</TableHead>
                <TableHead>{t("ops.supplierManagementShopifyStatus")}</TableHead>
                <TableHead>{t("ops.supplierAccountsHeaderLeadLimit")}</TableHead>
                <TableHead>{t("ops.supplierAccountsFormPrompt")}</TableHead>
                <TableHead>{t("ops.headerCreatedAt")}</TableHead>
                <TableHead>{t("ops.supplierAccountsHeaderActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspaces.map((ws) => {
                const primary = ws.members.find((m) => m.role === "owner") ?? ws.members[0];
                const sc = ws.shopify_config;
                return (
                  <TableRow key={ws.workspace_id} style={{ opacity: ws.is_active ? 1 : 0.5 }}>
                    <TableCell style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{ws.workspace_id}</TableCell>
                    <TableCell><TruncatedCell>{primary?.username || "—"}</TruncatedCell></TableCell>
                    <TableCell><TruncatedCell>{ws.workspace_name}</TruncatedCell></TableCell>
                    <TableCell><TruncatedCell>{primary ? (primary.ws_user_name || primary.nickname || primary.username) : "—"}</TruncatedCell></TableCell>
                    <TableCell>{primary ? roleLabel(primary.role, locale) : "—"}</TableCell>
                    <TableCell><TruncatedCell>{primary?.phone || "—"}</TruncatedCell></TableCell>
                    <TableCell>
                      {sc?.has_config
                        ? (sc.is_active
                            ? t("ops.shopifyConfigEnabled")
                            : t("ops.shopifyConfigDisabled"))
                        : t("ops.shopifyConfigNotConfigured")}
                    </TableCell>
                    <TableCell style={{ color: "var(--text-secondary)" }}>
                      {ws.daily_lead_limit > 0 ? ws.daily_lead_limit : "—"}
                    </TableCell>
                    <TableCell><TruncatedCell>{ws.prompt || "—"}</TruncatedCell></TableCell>
                    <TableCell style={{ whiteSpace: "nowrap", color: "var(--text-tertiary)", fontSize: 12 }}>
                      {formatDatetime(ws.created_at)}
                    </TableCell>
                    <TableCell>
                      <BackendRowActions
                        label={t("common.moreActions")}
                        items={[
                          { label: t("ops.supplierAccountsEdit"), onSelect: () => openEdit(ws) },
                          ...(primary?.is_superuser
                            ? []
                            : ws.is_active
                              ? [{ label: t("ops.supplierAccountsDisable"), onSelect: () => setDisableTarget(ws), tone: "destructive" as const }]
                              : [
                                  { label: t("ops.supplierAccountsActive"), onSelect: () => void enableWorkspace(ws), disabled: enablingWorkspaceId === ws.workspace_id },
                                  { label: t("ops.supplierAccountsDelete"), onSelect: () => setDeleteTarget(ws), tone: "destructive" as const },
                                ]
                          ),
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 分页 */}
      {workspaces.length > 0 && (
        <div className={styles.pagination}>
          <span className={styles.paginationInfo}>{t("ops.apiKeysPaginationInfo", { total, page, totalPages })}</span>
          <div className={styles.paginationControls}>
            <BackendPageSizeSelect
              label={t("ops.apiKeysPerPage")}
              value={pageSize}
              options={[10, 20, 50]}
              onChange={(value) => { setPageSize(value); setPage(1); }}
            />
            <button className={styles.pageBtn} disabled={page <= 1} onClick={() => goPage(page - 1)}>
              <ChevronLeft size={14} />
            </button>
            <span className={styles.pageCurrent}>{page}</span>
            <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => goPage(page + 1)}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ==================== 创建抽屉 ==================== */}
      <Sheet open={showCreate} onOpenChange={(open) => { if (!open) closeCreate(); }}>
        <SheetContent side="right" className={styles.opsDrawerContent}>
          {!createdAccount ? (
            <>
              <SheetHeader>
                <SheetTitle>{t("ops.supplierAccountsCreateTitle")}</SheetTitle>
                <SheetDescription>{t("ops.supplierAccountsCreateDesc")}</SheetDescription>
              </SheetHeader>
              <div className={styles.drawerBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>{t("ops.supplierAccountsFormUsername")}</label>
                  <Input
                    type="text"
                    className={styles.formInput}
                    value={createForm.username}
                    onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                    placeholder={t("ops.supplierAccountsFormUsernamePlaceholder")}
                    maxLength={150}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>{t("ops.supplierAccountsFormPhone")}</label>
                  <Input
                    type="text"
                    className={styles.formInput}
                    value={createForm.phone}
                    onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder={t("ops.supplierAccountsFormPhonePlaceholder")}
                    maxLength={20}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>{t("ops.supplierAccountsFormEmail")}</label>
                  <Input
                    type="email"
                    className={styles.formInput}
                    value={createForm.email}
                    onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder={t("ops.supplierAccountsFormEmailPlaceholder")}
                    maxLength={254}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>{t("ops.supplierAccountsFormWorkspaceName")}</label>
                  <Input
                    type="text"
                    className={styles.formInput}
                    value={createForm.workspace_name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, workspace_name: e.target.value }))}
                    placeholder={t("ops.supplierAccountsFormWorkspaceNamePlaceholder")}
                    maxLength={200}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>{t("ops.supplierAccountsFormContactName")}</label>
                  <Input
                    type="text"
                    className={styles.formInput}
                    value={createForm.contact_name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, contact_name: e.target.value }))}
                    placeholder={t("ops.supplierAccountsFormContactNamePlaceholder")}
                    maxLength={150}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>{t("ops.supplierAccountsFormPrompt")}</label>
                  <Textarea
                    className={styles.formInput}
                    value={createForm.prompt}
                    onChange={(e) => setCreateForm((f) => ({ ...f, prompt: e.target.value }))}
                    placeholder={t("ops.supplierAccountsFormPromptPlaceholder")}
                    rows={4}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>{t("ops.supplierAccountsFormLeadLimit")}</label>
                  <Input
                    type="number"
                    className={styles.formInput}
                    value={String(createForm.daily_lead_limit)}
                    onChange={(e) => setCreateForm((f) => ({ ...f, daily_lead_limit: Math.max(0, parseInt(e.target.value) || 0) }))}
                    placeholder="0"
                    min={0}
                  />
                </div>
                {createError ? <p className={styles.formError}>{createError}</p> : null}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeCreate} disabled={creating}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? <Loader2 size={14} className={styles.spinIcon} /> : null}
                  {t("ops.supplierAccountsConfirmCreate")}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle>{t("ops.supplierAccountsCreatedTitle")}</SheetTitle>
                <SheetDescription>{t("ops.supplierAccountsCreatedDesc")}</SheetDescription>
              </SheetHeader>
              <div className={styles.keyRevealBox}>
                <div className={styles.keyRevealLabel}>
                  {t("ops.supplierAccountsFormUsername")}: {createdAccount.username}
                </div>
                <div className={styles.keyRevealLabel}>
                  {t("ops.headerCompany")}: {createdAccount.workspace_name}
                </div>
                <div className={styles.keyRevealValue}>
                  <code>{createdAccount.password}</code>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button type="button" className={styles.copyBtn} onClick={copyPassword} />
                      }
                    >
                      {passwordCopied ? <Check size={14} /> : <Copy size={14} />}
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {passwordCopied ? t("ops.supplierAccountsPasswordCopied") : t("ops.supplierAccountsCopyPassword")}
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

      {/* ==================== 编辑抽屉（三区块） ==================== */}
      <Sheet open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <SheetContent side="right" className={styles.opsDrawerContent}>
          {editLoading ? (
            <>
              <SheetHeader>
                <SheetTitle>{t("ops.supplierAccountsEditTitle")}</SheetTitle>
              </SheetHeader>
              <p className={styles.loadingText}>{t("common.loading")}</p>
            </>
          ) : editError ? (
            <>
              <SheetHeader>
                <SheetTitle>{t("ops.supplierAccountsEditTitle")}</SheetTitle>
              </SheetHeader>
              <p className={styles.formError}>{editError}</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditTarget(null)}>
                  {t("common.close")}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle>{t("ops.supplierAccountsEditTitle")}</SheetTitle>
                <SheetDescription>
                  {t("ops.supplierAccountsEditDesc", { name: editTarget?.workspace_name ?? "" })}
                </SheetDescription>
              </SheetHeader>
              <div className={styles.drawerBody}>
                <Tabs value={editTab} onValueChange={setEditTab}>
                  <TabsList variant="line" className={styles.drawerTabs}>
                    <TabsTrigger value="basic">
                      {t("ops.supplierManagementSectionBasicInfo")}
                    </TabsTrigger>
                    <TabsTrigger value="site">
                      {t("ops.supplierManagementSectionIndependentSite")}
                    </TabsTrigger>
                    <TabsTrigger value="lead">
                      {t("ops.supplierManagementSectionLeadGen")}
                    </TabsTrigger>
                  </TabsList>

                  {/* ===== Tab 1：供应商基础信息 ===== */}
                  <TabsContent value="basic" className={styles.drawerTabContent}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>{t("ops.headerUsername")}</label>
                      <Input
                        type="text"
                        className={styles.formInput}
                        value={editDetail?.username || "—"}
                        disabled
                        readOnly
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>{t("ops.supplierAccountsFormWorkspaceName")}</label>
                      <Input
                        type="text"
                        className={styles.formInput}
                        value={editForm.workspace_name}
                        onChange={(e) => setEditForm((f) => ({ ...f, workspace_name: e.target.value }))}
                        placeholder={t("ops.supplierAccountsFormWorkspaceNamePlaceholder")}
                        maxLength={200}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>{t("ops.supplierAccountsFormContactName")}</label>
                      <Input
                        type="text"
                        className={styles.formInput}
                        value={editForm.contact_name}
                        onChange={(e) => setEditForm((f) => ({ ...f, contact_name: e.target.value }))}
                        placeholder={t("ops.supplierAccountsFormContactNamePlaceholder")}
                        maxLength={150}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>{t("ops.supplierAccountsFormPhone")}</label>
                      <Input
                        type="text"
                        className={styles.formInput}
                        value={editForm.phone}
                        onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                        placeholder={t("ops.supplierAccountsFormPhonePlaceholder")}
                        maxLength={20}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>{t("ops.supplierAccountsFormEmail")}</label>
                      <Input
                        type="email"
                        className={styles.formInput}
                        value={editForm.email}
                        onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder={t("ops.supplierAccountsFormEmailPlaceholder")}
                        maxLength={254}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>{t("ops.supplierAccountsFormRole")}</label>
                      <Select value={editForm.role} onValueChange={(v) => setEditForm((f) => ({ ...f, role: v as "owner" | "admin" }))}>
                        <SelectTrigger className={styles.formSelect}>
                          <SelectValue>{roleLabel(editForm.role, locale)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent className={styles.backendSelectContent}>
                          <SelectGroup>
                            <SelectItem value="owner">{roleLabel("owner", locale)}</SelectItem>
                            <SelectItem value="admin">{roleLabel("admin", locale)}</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                  </TabsContent>

                  {/* ===== Tab 2：独立站信息 ===== */}
                  <TabsContent value="site" className={styles.drawerTabContent}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>{t("ops.shopifyConfigSiteType")}</label>
                      <select
                        className={styles.formInput}
                        value={editForm.site_type}
                        onChange={(e) => setEditForm((f) => ({ ...f, site_type: e.target.value }))}
                        style={{ appearance: "auto" }}
                      >
                        <option value="">{t("ops.shopifyConfigSiteTypeNone")}</option>
                        <option value="shopify">{t("ops.shopifyConfigSiteTypeShopify")}</option>
                        <option value="independent">{t("ops.shopifyConfigSiteTypeIndependent")}</option>
                      </select>
                    </div>

                    {editForm.site_type === "shopify" && (
                      <>
                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>{t("ops.shopifyConfigStoreUrl")}</label>
                          <Input
                            className={styles.formInput}
                            value={editForm.store_url}
                            onChange={(e) => setEditForm((f) => ({ ...f, store_url: e.target.value }))}
                            placeholder="https://xxx.myshopify.com"
                          />
                        </div>
                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>{t("ops.shopifyConfigApiKey")}</label>
                          <Input
                            className={styles.formInput}
                            value={editForm.api_key}
                            onChange={(e) => setEditForm((f) => ({ ...f, api_key: e.target.value }))}
                            placeholder="Shopify App client_id"
                          />
                        </div>
                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>{t("ops.shopifyConfigSecretKey")}</label>
                          <Input
                            className={styles.formInput}
                            value={editForm.api_secret_key}
                            onChange={(e) => setEditForm((f) => ({ ...f, api_secret_key: e.target.value }))}
                            placeholder="Shopify App client_secret"
                          />
                        </div>
                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>{t("ops.shopifyConfigStatus")}</label>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <span>{shopifyConfigId ? (shopifyConfigActive ? t("ops.shopifyConfigEnabled") : t("ops.shopifyConfigDisabled")) : t("ops.shopifyConfigNotConfigured")}</span>
                            <Button type="button" variant="outline" size="sm" disabled={!shopifyConfigId || shopifyActing} onClick={() => void updateShopifyStatus(!shopifyConfigActive)}>
                              {shopifyConfigActive ? (locale === "zh-CN" ? "停用" : "Disable") : (locale === "zh-CN" ? "启用" : "Enable")}
                            </Button>
                            <Tooltip>
                              <TooltipTrigger render={<span />}>
                                <Button type="button" variant="destructive" size="sm" disabled={!shopifyConfigId || shopifyConfigActive || shopifyActing} onClick={() => void deleteShopifyConfig()}>
                                  {t("ops.shopifyConfigDelete")}
                                </Button>
                              </TooltipTrigger>
                              {shopifyConfigActive ? <TooltipContent>{t("ops.shopifyConfigDeleteDisabledHint")}</TooltipContent> : null}
                            </Tooltip>
                          </div>
                        </div>
                      </>
                    )}

                    {editForm.site_type === "independent" && (
                      <>
                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>{t("ops.vendureChannelsToken")}</label>
                          <Input
                            className={styles.formInput}
                            value={editForm.vendure_channels_token}
                            onChange={(e) => setEditForm((f) => ({ ...f, vendure_channels_token: e.target.value }))}
                            placeholder={t("ops.vendureChannelsTokenPlaceholder")}
                          />
                        </div>
                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>{t("ops.vendureUrl")}</label>
                          <Input
                            className={styles.formInput}
                            value={editForm.vendure_url}
                            onChange={(e) => setEditForm((f) => ({ ...f, vendure_url: e.target.value }))}
                            placeholder={t("ops.vendureUrlPlaceholder")}
                          />
                        </div>
                      </>
                    )}
                  </TabsContent>

                  {/* ===== Tab 3：寻客信息 ===== */}
                  <TabsContent value="lead" className={styles.drawerTabContent}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>{t("ops.supplierAccountsFormLeadLimit")}</label>
                      <Input
                        type="number"
                        className={styles.formInput}
                        value={String(editForm.daily_lead_limit)}
                        onChange={(e) => setEditForm((f) => ({ ...f, daily_lead_limit: Math.max(0, parseInt(e.target.value) || 0) }))}
                        placeholder="0"
                        min={0}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>{t("ops.supplierAccountsFormPrompt")}</label>
                      <Textarea
                        className={styles.formInput}
                        value={editForm.prompt}
                        onChange={(e) => setEditForm((f) => ({ ...f, prompt: e.target.value }))}
                        placeholder={t("ops.supplierAccountsFormPromptPlaceholder")}
                        rows={4}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
              {editError ? <p className={styles.formError}>{editError}</p> : null}
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editing}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={handleEdit} disabled={editing}>
                  {editing ? <Loader2 size={14} className={styles.spinIcon} /> : null}
                  {t("ops.supplierAccountsConfirmEdit")}
                </Button>
              </DialogFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ==================== 停用确认对话框 ==================== */}
      <Dialog open={!!disableTarget} onOpenChange={(open) => { if (!open) setDisableTarget(null); }}>
        <DialogContent className={styles.createDialog} showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("ops.supplierAccountsDisableTitle")}</DialogTitle>
            <DialogDescription>
              {t("ops.supplierAccountsDisableConfirm", { name: disableTarget?.workspace_name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableTarget(null)} disabled={disabling}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDisable} disabled={disabling}>
              {disabling ? <Loader2 size={14} className={styles.spinIcon} /> : null}
              {t("ops.supplierAccountsConfirmDisable")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== 删除确认对话框 ==================== */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className={styles.createDialog} showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("ops.supplierAccountsDeleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("ops.supplierAccountsDeleteConfirm", { name: deleteTarget?.workspace_name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Loader2 size={14} className={styles.spinIcon} /> : null}
              {t("ops.supplierAccountsConfirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
