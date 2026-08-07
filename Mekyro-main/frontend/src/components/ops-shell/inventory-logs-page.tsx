import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, ChevronLeft, ChevronRight, X } from "lucide-react";
import i18n from "@/i18n";
import { BackendDataSurface } from "@/components/backend-ui/backend-data-surface";
import { BackendCombobox } from "@/components/backend-ui/backend-combobox";
import { BackendSearchButton } from "@/components/backend-ui/backend-search-button";
import { BackendPaginationNumbers } from "@/components/backend-ui/backend-pagination";
import {
  BackendEmptyState,
  BackendErrorState,
  BackendTableSkeleton,
} from "@/components/backend-ui/backend-state-panel";
import { BackendStatusBadge } from "@/components/backend-ui/backend-status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BackendPageSizeSelect } from "./backend-select";
import { TruncatedCell } from "./truncated-cell";
import { SortButton } from "./sort-button";
import { useWorkspace } from "./workspace-context";

import styles from "./ops-shell.module.css";

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const TYPE_OPTIONS = [
  { value: "inbound", label: "入库", labelEn: "Inbound" },
  { value: "outbound", label: "出库", labelEn: "Outbound" },
  { value: "adjustment", label: "调整", labelEn: "Adjustment" },
];

type InventoryLogItem = {
  id: number;
  ws_sku_id: number;
  sku_code: string;
  product_name: string;
  type: string;
  quantity: number;
  reason: string;
  reference_id: string;
  created_by: string;
  created_at: string;
};

function getToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)ai_trade_token=([^;]*)/);
  return match?.[1] ?? null;
}

export function InventoryLogsPage() {
  const { t } = useTranslation();
  const locale = i18n.language;
  const { selectedWorkspaceId } = useWorkspace();

  const [logs, setLogs] = useState<InventoryLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [ordering, setOrdering] = useState("-id");

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchLogs = useCallback(() => {
    const token = getToken();
    if (!token || !selectedWorkspaceId) { setLoading(false); return; }
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize), ordering, workspace_id: selectedWorkspaceId });
    if (search) params.set("search", search);
    if (typeFilter) params.set("type", typeFilter);
    fetch(`/api/internal/inventory-logs/?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.code === 200 && data.data) {
          setLogs(data.data.results ?? []);
          setTotal(data.data.total ?? 0);
        } else { setError(data?.message ?? t("ops.inventoryLogsFetchFailed")); }
      })
      .catch(() => setError(t("ops.inventoryLogsFetchFailed")))
      .finally(() => setLoading(false));
  }, [page, pageSize, search, typeFilter, selectedWorkspaceId, ordering, t]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  function handleSearch() { setSearch(searchInput.trim()); setPage(1); }
  function clearSearch() { setSearchInput(""); setSearch(""); setPage(1); }
  function goPage(p: number) { setPage(Math.max(1, Math.min(p, totalPages))); }
  function formatDatetime(iso: string): string { return iso ? new Date(iso).toLocaleString(locale) : "—"; }
  function typeLabel(v: string) { const o = TYPE_OPTIONS.find((x) => x.value === v); return o ? (locale === "zh-CN" ? o.label : o.labelEn) : v; }

  return (
    <div className={`${styles.whiteCard} ${styles.dataPage}`}>
      <BackendDataSurface
        toolbar={(
          <div className={`${styles.searchBar} ${styles.opsWorkbenchToolbar}`}>
        <div className={styles.opsSearchGroup} role="search">
          <div className={styles.searchInputWrap}>
            <Search size={14} className={styles.searchIcon} />
            <input type="text" className={styles.searchInput} value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              placeholder={t("ops.inventoryLogsSearchPlaceholder")} />
            {searchInput ? <button type="button" className={styles.searchClearBtn} onClick={clearSearch}><X size={14} /></button> : null}
          </div>
          <BackendSearchButton label={t("ops.search")} onClick={handleSearch} />
        </div>
        <div className={styles.opsFilterGroup} role="group" aria-label={t("ops.inventoryLogsAllType")}>
          <BackendCombobox
            aria-label={t("ops.inventoryLogsAllType")}
            value={typeFilter}
            onChange={(value) => { setTypeFilter(value); setPage(1); }}
            options={[
              { value: "", label: t("ops.inventoryLogsAllType") },
              ...TYPE_OPTIONS.map((o) => ({ value: o.value, label: locale === "zh-CN" ? o.label : o.labelEn })),
            ]}
            emptyLabel={t("ops.comboboxNoResults")}
            placeholder={t("ops.inventoryLogsAllType")}
            variant="filter"
          />
        </div>
          </div>
        )}
        footer={(!loading && !error && logs.length > 0) ? (
          <div className={styles.pagination}>
            <span className={styles.paginationInfo}>{t("ops.apiKeysPaginationInfo", { total, page, totalPages })}</span>
            <div className={styles.paginationControls}>
              <BackendPageSizeSelect
                label={t("ops.apiKeysPerPage")}
                value={pageSize}
                options={PAGE_SIZE_OPTIONS}
                onChange={(value) => { setPageSize(value); setPage(1); }}
              />
              <button className={styles.pageBtn} disabled={page <= 1} onClick={() => goPage(page - 1)}><ChevronLeft size={14} /></button>
              <BackendPaginationNumbers page={page} totalPages={totalPages} onPageChange={goPage} />
              <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => goPage(page + 1)}><ChevronRight size={14} /></button>
            </div>
          </div>
        ) : undefined}
      >

        {loading ? (<BackendTableSkeleton label={t("common.loading")} />)
      : error ? (<BackendErrorState title={error} />)
      : logs.length === 0 ? (<BackendEmptyState title={t("ops.inventoryLogsEmpty")} />)
      : (
          <div className={styles.tableWrapper}>
            <Table className={`${styles.dataTable} ${styles.inventoryLogsTable}`}>
              <TableHeader>
                <TableRow>
                  <TableHead><SortButton label="ID" ordering={ordering} showIndicator={false} onOrderingChange={(v) => { setOrdering(v); setPage(1); }} /></TableHead>
                  <TableHead>{t("ops.inventoryLogsColProduct")}</TableHead>
                  <TableHead>{t("ops.inventoryLogsColSku")}</TableHead>
                  <TableHead>{t("ops.inventoryLogsColType")}</TableHead>
                  <TableHead>{t("ops.inventoryLogsColQuantity")}</TableHead>
                  <TableHead>{t("ops.inventoryLogsColReason")}</TableHead>
                  <TableHead>{t("ops.inventoryLogsColRef")}</TableHead>
                  <TableHead>{t("ops.inventoryLogsColBy")}</TableHead>
                  <TableHead>{t("ops.inventoryLogsColCreated")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{item.id}</TableCell>
                    <TableCell><TruncatedCell>{item.product_name}</TruncatedCell></TableCell>
                    <TableCell><TruncatedCell>{item.sku_code}</TruncatedCell></TableCell>
                    <TableCell>
                      <BackendStatusBadge tone={item.type === "inbound" ? "info" : "neutral"}>
                        {typeLabel(item.type)}
                      </BackendStatusBadge>
                    </TableCell>
                    <TableCell style={{ fontWeight: 500, color: item.quantity >= 0 ? "#2e7d32" : "#c62828" }}>
                      {item.quantity >= 0 ? "+" : ""}{item.quantity}
                    </TableCell>
                    <TableCell><TruncatedCell>{item.reason || "—"}</TruncatedCell></TableCell>
                    <TableCell><TruncatedCell>{item.reference_id || "—"}</TruncatedCell></TableCell>
                    <TableCell><TruncatedCell>{item.created_by || "—"}</TruncatedCell></TableCell>
                    <TableCell style={{ color: "var(--text-tertiary)", fontSize: 12, whiteSpace: "nowrap" }}>{formatDatetime(item.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
      )}
      </BackendDataSurface>
    </div>
  );
}
