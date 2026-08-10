import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, ChevronLeft, ChevronRight, Loader2, ShoppingBag, Store, X, type LucideIcon } from "lucide-react";
import i18n from "@/i18n";
import { BackendDataSurface } from "@/components/backend-ui/backend-data-surface";
import { BackendCombobox } from "@/components/backend-ui/backend-combobox";
import { BackendSearchButton } from "@/components/backend-ui/backend-search-button";
import { BackendPaginationNumbers } from "@/components/backend-ui/backend-pagination";
import { BackendRowActions } from "@/components/backend-ui/backend-row-actions";
import {
  BackendEmptyState,
  BackendErrorState,
  BackendTableSkeleton,
} from "@/components/backend-ui/backend-state-panel";
import { BackendStatusBadge } from "@/components/backend-ui/backend-status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BackendPageSizeSelect } from "./backend-select";
import { TruncatedCell } from "./truncated-cell";
import { SortButton } from "./sort-button";

import styles from "./ops-shell.module.css";
import { COUNTRY_OPTIONS } from "@/lib/countries";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const STATUS_OPTIONS = [
  { value: "pending", label: "待处理", labelEn: "Pending" },
  { value: "processing", label: "处理中", labelEn: "Processing" },
  { value: "completed", label: "已完成", labelEn: "Completed" },
  { value: "rejected", label: "已拒绝", labelEn: "Rejected" },
];

type InquiryItem = {
  id: number;
  company_name: string;
  business_text: string;
  country: string;
  contact_name: string;
  phone: string;
  email: string;
  remark: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type InquiryKind = "supplier" | "buyer";

const KIND_CONFIG: Record<InquiryKind, {
  Icon: LucideIcon;
  titleKey: string;
  searchPlaceholderKey: string;
  pathSegment: "suppliers" | "buyers";
  businessField: "main_business" | "required_product";
  businessColKey: string;
}> = {
  supplier: {
    Icon: Store,
    titleKey: "ops.supplierInquiriesTitle",
    searchPlaceholderKey: "ops.supplierInquirySearchPlaceholder",
    pathSegment: "suppliers",
    businessField: "main_business",
    businessColKey: "ops.inquiryColMainBusiness",
  },
  buyer: {
    Icon: ShoppingBag,
    titleKey: "ops.buyerInquiriesTitle",
    searchPlaceholderKey: "ops.buyerInquirySearchPlaceholder",
    pathSegment: "buyers",
    businessField: "required_product",
    businessColKey: "ops.inquiryColRequiredProduct",
  },
};

function getToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)ai_trade_token=([^;]*)/);
  return match?.[1] ?? null;
}

export function InquiriesPage({ kind }: { kind: InquiryKind }) {
  const { t } = useTranslation();
  const locale = i18n.language;
  const config = KIND_CONFIG[kind];

  const [items, setItems] = useState<InquiryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [ordering, setOrdering] = useState("-id");

  const [detailTarget, setDetailTarget] = useState<InquiryItem | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<InquiryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchList = useCallback(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }

    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (countryFilter) params.set("country", countryFilter);
    params.set("ordering", ordering);

    fetch(`/api/internal/inquiries/${config.pathSegment}/?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.code === 200 && data.data) {
          const field = config.businessField;
          setItems((data.data.results ?? []).map((r: Record<string, unknown>) => ({
            id: Number(r.id),
            company_name: String(r.company_name ?? ""),
            business_text: String(r[field] ?? ""),
            country: String(r.country ?? ""),
            contact_name: String(r.contact_name ?? ""),
            phone: String(r.phone ?? ""),
            email: String(r.email ?? ""),
            remark: String(r.remark ?? ""),
            status: String(r.status ?? ""),
            created_at: String(r.created_at ?? ""),
            updated_at: String(r.updated_at ?? ""),
          })));
          setTotal(data.data.total ?? 0);
        } else {
          setError(data?.message ?? t("ops.inquiryFetchFailed"));
        }
      })
      .catch(() => setError(t("ops.inquiryFetchFailed")))
      .finally(() => setLoading(false));
  }, [page, pageSize, search, statusFilter, countryFilter, ordering, t, config]);

  useEffect(() => { fetchList(); }, [fetchList]);

  function handleSearch() { setSearch(searchInput.trim()); setPage(1); }
  function clearSearch() { setSearchInput(""); setSearch(""); setPage(1); }

  function openDetail(item: InquiryItem) {
    setDetailTarget(item);
    setEditStatus(item.status);
    setEditError("");
  }

  async function handleSaveStatus() {
    if (!detailTarget) return;
    const token = getToken();
    if (!token) return;
    setSaving(true);
    setEditError("");
    try {
      const res = await fetch(`/api/internal/inquiries/${config.pathSegment}/${detailTarget.id}/update/`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: editStatus }),
      });
      const data = await res.json();
      if (data?.code === 200) {
        setDetailTarget(null);
        fetchList();
      } else {
        setEditError(data?.message ?? t("ops.inquiryUpdateFailed"));
      }
    } catch {
      setEditError(t("ops.inquiryUpdateFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const token = getToken();
    if (!token) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/internal/inquiries/${config.pathSegment}/${deleteTarget.id}/delete/`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data?.code === 200) {
        setItems((prev) => prev.filter((l) => l.id !== deleteTarget.id));
        setTotal((prev) => prev - 1);
      }
    } catch { /* ignore */ } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  function goPage(p: number) { setPage(Math.max(1, Math.min(p, totalPages))); }

  function formatDatetime(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(locale);
  }

  const statusLabel = (v: string) => {
    const opt = STATUS_OPTIONS.find((o) => o.value === v);
    return opt ? (locale === "zh-CN" ? opt.label : opt.labelEn) : v;
  };

  const countryLabel = (v: string) => {
    const opt = COUNTRY_OPTIONS.find((o) => o.value === v);
    return opt ? (locale === "zh-CN" ? opt.label : opt.labelEn) : v;
  };

  const { Icon } = config;

  return (
    <div className={`${styles.whiteCard} ${styles.dataPage}`}>
      <BackendDataSurface
        toolbar={(
          <div className={`${styles.searchBar} ${styles.opsWorkbenchToolbar}`}>
        <div className={styles.opsSearchGroup} role="search">
          <div className={styles.searchInputWrap}>
            <Search size={14} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              placeholder={t(config.searchPlaceholderKey)}
            />
            {searchInput ? (
              <button type="button" className={styles.searchClearBtn} onClick={clearSearch}>
                <X size={14} />
              </button>
            ) : null}
          </div>
          <BackendSearchButton label={t("ops.search")} onClick={handleSearch} />
        </div>
        <div className={styles.opsFilterGroup} role="group" aria-label={t("ops.productsFilterLabel")}>
          <BackendCombobox
            aria-label={t("ops.inquiryAllStatuses")}
            value={statusFilter}
            onChange={(value) => { setStatusFilter(value); setPage(1); }}
            options={[
              { value: "", label: t("ops.inquiryAllStatuses") },
              ...STATUS_OPTIONS.map((s) => ({ value: s.value, label: locale === "zh-CN" ? s.label : s.labelEn })),
            ]}
            emptyLabel={t("ops.comboboxNoResults")}
            placeholder={t("ops.inquiryAllStatuses")}
            variant="filter"
          />
          <BackendCombobox
            aria-label={t("ops.leadsAllCountries")}
            value={countryFilter}
            onChange={(value) => { setCountryFilter(value); setPage(1); }}
            options={[
              { value: "", label: t("ops.leadsAllCountries") },
              ...COUNTRY_OPTIONS.map((c) => ({ value: c.value, label: locale === "zh-CN" ? c.label : c.labelEn })),
            ]}
            emptyLabel={t("ops.comboboxNoResults")}
            placeholder={t("ops.leadsAllCountries")}
            variant="filter"
          />
        </div>
          </div>
        )}
        footer={(!loading && !error && items.length > 0) ? (
          <div className={styles.pagination}>
            <span className={styles.paginationInfo}>
              {search
                ? t("ops.leadsPaginationInfoWithSearch", { total, page, totalPages, search })
                : t("ops.apiKeysPaginationInfo", { total, page, totalPages })}
            </span>
            <div className={styles.paginationControls}>
              <BackendPageSizeSelect
                label={t("ops.apiKeysPerPage")}
                value={pageSize}
                options={PAGE_SIZE_OPTIONS}
                onChange={(value) => { setPageSize(value); setPage(1); }}
              />
              <button className={styles.pageBtn} disabled={page <= 1} onClick={() => goPage(page - 1)}>
                <ChevronLeft size={14} />
              </button>
              <BackendPaginationNumbers page={page} totalPages={totalPages} onPageChange={goPage} />
              <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => goPage(page + 1)}>
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
      ) : items.length === 0 ? (
        <BackendEmptyState title={t("ops.inquiryEmpty")} />
      ) : (
          <div className={styles.tableWrapper}>
            <Table className={`${styles.dataTable} ${styles.actionColumnTable} ${styles.compactActionColumn} ${styles.inquiryDataTable}`}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ops.inquiryColStatus")}</TableHead>
                  <TableHead>{t("ops.inquiryColCompany")}</TableHead>
                  <TableHead>{t(config.businessColKey)}</TableHead>
                  <TableHead>{t("ops.inquiryColCountry")}</TableHead>
                  <TableHead><SortButton label={t("ops.inquiryColCreated")} ordering={ordering} onOrderingChange={(v) => { setOrdering(v); setPage(1); }} /></TableHead>
                  <TableHead>{t("ops.apiKeysColActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <BackendStatusBadge tone={item.status === "completed" ? "success" : item.status === "cancelled" ? "danger" : item.status === "processing" ? "info" : "warning"}>
                        {statusLabel(item.status)}
                      </BackendStatusBadge>
                    </TableCell>
                    <TableCell><TruncatedCell>{item.company_name || "—"}</TruncatedCell></TableCell>
                    <TableCell><TruncatedCell>{item.business_text || "—"}</TruncatedCell></TableCell>
                    <TableCell>{countryLabel(item.country)}</TableCell>
                    <TableCell style={{ color: "var(--text-tertiary)", fontSize: 12, whiteSpace: "nowrap" }}>
                      {formatDatetime(item.created_at)}
                    </TableCell>
                    <TableCell>
                      <BackendRowActions
                        label={t("common.moreActions")}
                        items={[
                          { label: t("ops.productsViewDetail"), onSelect: () => openDetail(item) },
                          { label: t("ops.apiKeysDelete"), onSelect: () => setDeleteTarget(item), tone: "destructive" },
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

      {/* 详情 + 状态流转 */}
      <Dialog open={!!detailTarget} onOpenChange={(open) => { if (!open) setDetailTarget(null); }}>
        <DialogContent className={styles.editDialog}>
          <DialogHeader>
            <DialogTitle>{t("ops.inquiryDetailTitle")}</DialogTitle>
            <DialogDescription>
              {detailTarget?.company_name} (#{detailTarget?.id})
            </DialogDescription>
          </DialogHeader>

          <div className={styles.editDialogBody}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.inquiryColCompany")}</label>
              <span className={styles.formValue}>{detailTarget?.company_name || "—"}</span>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t(config.businessColKey)}</label>
              <span className={styles.formValue}>{detailTarget?.business_text || "—"}</span>
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup} style={{ flex: 1 }}>
                <label className={styles.formLabel}>{t("ops.inquiryColCountry")}</label>
                <span className={styles.formValue}>{countryLabel(detailTarget?.country ?? "")}</span>
              </div>
              <div className={styles.formGroup} style={{ flex: 1 }}>
                <label className={styles.formLabel}>{t("ops.inquiryColContact")}</label>
                <span className={styles.formValue}>{detailTarget?.contact_name || "—"}</span>
              </div>
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup} style={{ flex: 1 }}>
                <label className={styles.formLabel}>{t("ops.inquiryColPhone")}</label>
                <span className={styles.formValue}>{detailTarget?.phone || "—"}</span>
              </div>
              <div className={styles.formGroup} style={{ flex: 1 }}>
                <label className={styles.formLabel}>{t("ops.inquiryColEmail")}</label>
                <span className={styles.formValue}>{detailTarget?.email || "—"}</span>
              </div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.inquiryColRemark")}</label>
              <span className={styles.formValue}>{detailTarget?.remark || "—"}</span>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.inquiryColStatus")}</label>
              <BackendCombobox
                aria-label={t("ops.inquiryColStatus")}
                value={editStatus}
                onChange={setEditStatus}
                options={STATUS_OPTIONS.map((option) => ({
                  value: option.value,
                  label: locale === "zh-CN" ? option.label : option.labelEn,
                }))}
                emptyLabel={t("ops.comboboxNoResults")}
                placeholder={t("ops.inquiryColStatus")}
                variant="form"
              />
            </div>
            {editError ? <p className={styles.loadingText}>{editError}</p> : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailTarget(null)} disabled={saving}>{t("common.close")}</Button>
            <Button onClick={handleSaveStatus} disabled={saving || editStatus === detailTarget?.status}>
              {saving ? <Loader2 size={14} className={styles.spinIcon} /> : null}
              {t("ops.inquirySaveStatus")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className={styles.createDialog} showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("ops.inquiryDeleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("ops.inquiryDeleteConfirm", { name: deleteTarget?.company_name ?? "", id: deleteTarget?.id ?? "" })}
            </DialogDescription>
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
    </div>
  );
}
