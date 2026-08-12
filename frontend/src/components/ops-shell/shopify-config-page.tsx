import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Loader2, ChevronLeft, ChevronRight, Store } from "lucide-react";
import i18n from "@/i18n";
import { BackendCombobox } from "@/components/backend-ui/backend-combobox";
import { BackendDataSurface } from "@/components/backend-ui/backend-data-surface";
import { BackendPaginationNumbers } from "@/components/backend-ui/backend-pagination";
import { BackendRowActions } from "@/components/backend-ui/backend-row-actions";
import {
  BackendEmptyState,
  BackendErrorState,
  BackendTableSkeleton,
} from "@/components/backend-ui/backend-state-panel";
import { BackendStatusBadge } from "@/components/backend-ui/backend-status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

import { BackendPageSizeSelect } from "./backend-select";
import { TruncatedCell } from "./truncated-cell";
import styles from "./ops-shell.module.css";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

type ShopifyConfigRow = {
  workspace_id: number;
  workspace_name: string;
  description: string;
  site_type: string;
  config_id: number | null;
  store_url: string;
  api_key: string;
  api_secret_key: string;
  has_config: boolean;
  is_active: boolean;
};

function getToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)ai_trade_token=([^;]*)/);
  return match?.[1] ?? null;
}

export function ShopifyConfigPage() {
  const { t } = useTranslation();

  const [rows, setRows] = useState<ShopifyConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 统一编辑抽屉（供应商信息 + 凭证合二为一）
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editRow, setEditRow] = useState<ShopifyConfigRow | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formSiteType, setFormSiteType] = useState("");
  const [formStoreUrl, setFormStoreUrl] = useState("");
  const [formApiKey, setFormApiKey] = useState("");
  const [formSecretKey, setFormSecretKey] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ShopifyConfigRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchList = useCallback(() => {
    setLoading(true); setError("");
    const token = getToken();
    fetch(`/api/internal/shopify-configs/?page=${page}&page_size=${pageSize}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d?.code === 200 && d.data) { setRows(d.data.configs); setTotal(d.data.total); } else setError(d?.message ?? "加载失败"); })
      .catch(() => setError("网络错误")).finally(() => setLoading(false));
  }, [page, pageSize]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  function goPage(p: number) { setPage(Math.max(1, Math.min(p, totalPages))); }

  function openDrawer(row: ShopifyConfigRow) {
    setEditRow(row);
    setFormName(row.workspace_name);
    setFormDesc(row.description || "");
    setFormSiteType(row.site_type === "independent" ? "vendure" : (row.site_type || ""));
    setFormStoreUrl(row.store_url);
    setFormApiKey(row.api_key);
    setFormSecretKey(row.api_secret_key);
    setFormError("");
    setDrawerOpen(true);
  }

  function handleSubmit() {
    setFormError(""); setSubmitting(true);
    const token = getToken();
    const promises: Promise<any>[] = [];

    // 1. 更新供应商信息
    promises.push(
      fetch(`/api/workspace/${editRow!.workspace_id}/update/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspace_name: formName, description: formDesc, site_type: formSiteType }),
      }).then(r => r.json())
    );

    // 2. 如果选择了 shopify，保存/更新 Shopify 凭证
    if (formSiteType === "shopify") {
      const body: Record<string, any> = { store_url: formStoreUrl, api_key: formApiKey, api_secret_key: formSecretKey };
      let url: string; let method: string;
      if (editRow!.config_id) {
        url = `/api/internal/shopify-configs/${editRow!.config_id}/update/`; method = "PATCH";
      } else {
        url = "/api/internal/shopify-configs/create/"; method = "POST";
        body.workspace_id = editRow!.workspace_id;
      }
      promises.push(fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then(r => r.json()));
    }

    Promise.all(promises).then(results => {
      const errors = results.filter(r => r?.code !== 200);
      if (errors.length > 0) { setFormError(errors.map(e => e.message).join("; ")); setSubmitting(false); return; }
      setDrawerOpen(false); fetchList(); setSubmitting(false);
    }).catch(() => { setFormError("网络错误"); setSubmitting(false); });
  }

  function toggleStatus(row: ShopifyConfigRow) {
    if (!row.config_id) return;
    const token = getToken();
    fetch(`/api/internal/shopify-configs/${row.config_id}/status/`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_active: !row.is_active }),
    }).then(r => r.json()).then(d => { if (d?.code === 200) fetchList(); else alert(d?.message ?? "操作失败"); }).catch(() => alert("网络错误"));
  }

  function handleDelete() {
    if (!deleteTarget?.config_id) return; setDeleting(true);
    const token = getToken();
    fetch(`/api/internal/shopify-configs/${deleteTarget.config_id}/delete/`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d?.code === 200) { setDeleteTarget(null); fetchList(); } else alert(d?.message ?? "删除失败"); })
      .catch(() => alert("网络错误")).finally(() => setDeleting(false));
  }

  function siteTypeLabel(tp: string): string {
    if (tp === "shopify") return t("ops.shopifyConfigSiteTypeShopify");
    if (tp === "vendure" || tp === "independent") return t("ops.shopifyConfigSiteTypeIndependent");
    return t("ops.shopifyConfigSiteTypeNone");
  }

  const showShopifyFields = formSiteType === "shopify";

  return (
    <div className={`${styles.whiteCard} ${styles.dataPage}`}>
      <BackendDataSurface
        footer={total > 0 ? (
          <div className={styles.pagination}>
            <span className={styles.paginationInfo}>{t("ops.shopifyConfigPagination", { total, page, totalPages })}</span>
            <div className={styles.paginationControls}>
              <BackendPageSizeSelect label={t("ops.shopifyConfigPerPage")} value={pageSize} options={PAGE_SIZE_OPTIONS} onChange={v => { setPageSize(v); setPage(1); }} />
              <button className={styles.pageBtn} disabled={page <= 1} onClick={() => goPage(page - 1)}><ChevronLeft size={14} /></button>
              <BackendPaginationNumbers page={page} totalPages={totalPages} onPageChange={goPage} />
              <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => goPage(page + 1)}><ChevronRight size={14} /></button>
            </div>
          </div>
        ) : undefined}
      >
        {error ? <BackendErrorState title={error} /> : null}

        {loading ? <BackendTableSkeleton label={t("common.loading")} /> : rows.length === 0 ? <BackendEmptyState title={t("ops.shopifyConfigEmpty")} /> : (
        <div className={styles.tableWrapper}>
          <Table className={`${styles.dataTable} ${styles.actionColumnTable} ${styles.compactActionColumn} ${styles.shopifyConfigTable}`}>
            <TableHeader><TableRow>
              <TableHead>{t("ops.shopifyConfigSupplier")}</TableHead>
              <TableHead>{t("ops.shopifyConfigDescription")}</TableHead>
              <TableHead>{t("ops.shopifyConfigSiteType")}</TableHead>
              <TableHead>{t("ops.shopifyConfigStatus")}</TableHead>
              <TableHead>{t("ops.shopifyConfigActions")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map(row => (<TableRow key={row.workspace_id}>
                <TableCell><TruncatedCell>{row.workspace_name}</TruncatedCell></TableCell>
                <TableCell><TruncatedCell>{row.description || "-"}</TruncatedCell></TableCell>
                <TableCell>{siteTypeLabel(row.site_type)}</TableCell>
                <TableCell>
                  {row.has_config ? (
                    <button className={styles.statusToggleButton} onClick={() => toggleStatus(row)}>
                      <BackendStatusBadge tone={row.is_active ? "success" : "neutral"}>
                        {row.is_active ? t("ops.shopifyConfigEnabled") : t("ops.shopifyConfigDisabled")}
                      </BackendStatusBadge>
                    </button>
                  ) : (
                    <BackendStatusBadge tone="neutral">{t("ops.shopifyConfigNotConfigured")}</BackendStatusBadge>
                  )}
                </TableCell>
                <TableCell>
                  <BackendRowActions
                    label={t("common.moreActions")}
                    items={[
                      { label: t("ops.apiKeysEdit"), onSelect: () => openDrawer(row) },
                      ...(row.has_config ? [{
                        label: t("ops.shopifyConfigDelete"),
                        onSelect: () => setDeleteTarget(row),
                        tone: "destructive" as const,
                        disabled: row.is_active,
                        hint: row.is_active ? t("ops.shopifyConfigDeleteDisabledHint") : undefined,
                      }] : []),
                    ]}
                  />
                </TableCell>
              </TableRow>))}
            </TableBody>
          </Table>
        </div>
        )}
      </BackendDataSurface>

      {/* 统一编辑抽屉 */}
      <Sheet open={drawerOpen} onOpenChange={o => { if (!o) setDrawerOpen(false); }}>
        <SheetContent side="right" className={styles.opsDrawerContent}>
          <SheetHeader>
            <SheetTitle>{t("ops.apiKeysEdit")} — {editRow?.workspace_name}</SheetTitle>
          </SheetHeader>
          <div className={styles.shopifyDrawerBody}>
            {formError ? <p className={styles.formError}>{formError}</p> : null}
            <section className={styles.shopifyDrawerSection} aria-labelledby="ops-shopify-company-section">
              <div className={styles.shopifyDrawerSectionIntro}>
                <Building2 aria-hidden="true" />
                <div>
                  <h3 id="ops-shopify-company-section">{t("supplier.settingsCompanySection")}</h3>
                  <p>{t("supplier.settingsCompanyHint")}</p>
                </div>
              </div>
              <div className={styles.shopifyDrawerFields}>
                <div className={styles.shopifyDrawerFieldWide}>
                  <Label htmlFor="ops-shopify-supplier-name">{t("ops.shopifyConfigSupplierName")}</Label>
                  <Input id="ops-shopify-supplier-name" value={formName} onChange={e => setFormName(e.target.value)} />
                </div>
                <div className={styles.shopifyDrawerFieldWide}>
                  <Label htmlFor="ops-shopify-description">{t("ops.shopifyConfigDescription")}</Label>
                  <Textarea
                    id="ops-shopify-description"
                    value={formDesc}
                    onChange={e => setFormDesc(e.target.value)}
                    rows={5}
                  />
                </div>
              </div>
            </section>
            <section className={styles.shopifyDrawerSection} aria-labelledby="ops-shopify-site-section">
              <div className={styles.shopifyDrawerSectionIntro}>
                <Store aria-hidden="true" />
                <div>
                  <h3 id="ops-shopify-site-section">{t("supplier.settingsSiteSection")}</h3>
                  <p>{t("supplier.settingsSiteHint")}</p>
                </div>
              </div>
              <div className={styles.shopifyDrawerFields}>
                <div className={styles.shopifyDrawerFieldWide}>
                  <Label htmlFor="ops-shopify-site-type">{t("ops.shopifyConfigSiteType")}</Label>
                  <BackendCombobox
                    id="ops-shopify-site-type"
                    aria-label={t("ops.shopifyConfigSiteType")}
                    value={formSiteType}
                    onChange={setFormSiteType}
                    options={[
                      { value: "", label: t("ops.shopifyConfigSiteTypeNone") },
                      { value: "shopify", label: t("ops.shopifyConfigSiteTypeShopify") },
                      { value: "vendure", label: t("ops.shopifyConfigSiteTypeIndependent") },
                    ]}
                    emptyLabel={t("ops.comboboxNoResults")}
                    placeholder={t("ops.shopifyConfigSiteTypeNone")}
                    variant="form"
                    className={styles.shopifyDrawerSelect}
                  />
                </div>
                {showShopifyFields ? (<>
                  <div className={styles.shopifyDrawerFieldWide}>
                    <Label htmlFor="ops-shopify-store-url">{t("ops.shopifyConfigStoreUrl")}</Label>
                    <Input id="ops-shopify-store-url" value={formStoreUrl} onChange={e => setFormStoreUrl(e.target.value)} placeholder="https://xxx.myshopify.com" />
                  </div>
                  <div className={styles.shopifyDrawerField}>
                    <Label htmlFor="ops-shopify-api-key">{t("ops.shopifyConfigApiKey")}</Label>
                    <Input id="ops-shopify-api-key" value={formApiKey} onChange={e => setFormApiKey(e.target.value)} placeholder="Shopify App client_id" />
                  </div>
                  <div className={styles.shopifyDrawerField}>
                    <Label htmlFor="ops-shopify-secret-key">{t("ops.shopifyConfigSecretKey")}</Label>
                    <Input id="ops-shopify-secret-key" type="password" value={formSecretKey} onChange={e => setFormSecretKey(e.target.value)} placeholder="Shopify App client_secret" />
                  </div>
                </>) : null}
              </div>
            </section>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={submitting}>{t("common.cancel")}</Button>
            <Button onClick={handleSubmit} disabled={submitting}>{submitting ? <Loader2 size={16} className={styles.spinIcon} /> : null}{t("ops.apiKeysConfirmEdit")}</Button>
          </DialogFooter>
        </SheetContent>
      </Sheet>

      {/* 删除确认 */}
      <Dialog open={deleteTarget !== null} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className={styles.createDialog}><DialogHeader><DialogTitle>{t("ops.shopifyConfigDeleteTitle")}</DialogTitle><DialogDescription>{t("ops.shopifyConfigDeleteDesc", { name: deleteTarget?.workspace_name ?? "" })}</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>{t("common.cancel")}</Button><Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting ? <Loader2 size={16} className={styles.spinIcon} /> : null}{t("ops.shopifyConfigConfirmDelete")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
