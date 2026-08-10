import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, ChevronLeft, ChevronRight, X } from "lucide-react";
import i18n from "@/i18n";
import { BackendDataSurface } from "@/components/backend-ui/backend-data-surface";
import { BackendCombobox } from "@/components/backend-ui/backend-combobox";
import { BackendSearchButton } from "@/components/backend-ui/backend-search-button";
import { BackendPaginationNumbers } from "@/components/backend-ui/backend-pagination";
import { BackendStatusBadge } from "@/components/backend-ui/backend-status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BackendPageSizeSelect } from "../ops-shell/backend-select";
import { TruncatedCell } from "../ops-shell/truncated-cell";
import { SortButton } from "../ops-shell/sort-button";
import { SupplierEmptyState, SupplierErrorState, SupplierTableSkeleton } from "./supplier-state-panel";

import opsStyles from "../ops-shell/ops-shell.module.css";
import supplierStyles from "./supplier-shell.module.css";

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const TYPE_OPTIONS = [
  { value: "inbound", label: "入库" },
  { value: "outbound", label: "出库" },
  { value: "adjustment", label: "调整" },
];

type InventoryLogItem = {
  id: number; ws_sku_id: number; sku_code: string; product_name: string;
  type: string; quantity: number; reason: string; reference_id: string;
  created_by: string; created_at: string;
};

function getToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)ai_trade_token=([^;]*)/);
  return match?.[1] ?? null;
}

export function SupplierInventoryLogsPage() {
  const { t } = useTranslation();
  const locale = i18n.language;

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
    const token = getToken(); if (!token) { setLoading(false); return; }
    setLoading(true); setError("");
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize), ordering });
    if (search) params.set("search", search);
    if (typeFilter) params.set("type", typeFilter);
    fetch(`/api/supplier/inventory-logs/?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data?.code === 200 && data.data) { setLogs(data.data.results ?? []); setTotal(data.data.total ?? 0); } else { setError(data?.message ?? "加载失败"); } })
      .catch(() => setError("加载失败"))
      .finally(() => setLoading(false));
  }, [page, pageSize, search, typeFilter, ordering]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  function handleSearch() { setSearch(searchInput.trim()); setPage(1); }
  function clearSearch() { setSearchInput(""); setSearch(""); setPage(1); }
  function goPage(p: number) { setPage(Math.max(1, Math.min(p, totalPages))); }
  function formatDatetime(iso: string): string { return iso ? new Date(iso).toLocaleString(locale) : "—"; }

  return (
    <div className={opsStyles.productsLayout}>
      <div className={`${opsStyles.whiteCard} ${opsStyles.dataPage} ${supplierStyles.supplierListCard}`}>
        <BackendDataSurface
          toolbar={(
            <div className={`${opsStyles.searchBar} ${supplierStyles.supplierInventoryToolbar}`}>
              <div className={supplierStyles.supplierInventorySearchGroup} role="search" aria-label={t("ops.search")}>
                <div className={`${opsStyles.searchInputWrap} ${supplierStyles.supplierInventorySearchInput}`}>
                  <Search size={14} className={opsStyles.searchIcon} />
                  <input type="text" className={opsStyles.searchInput} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }} placeholder={t("ops.inventoryLogsSearchPlaceholder")} />
                  {searchInput ? <button type="button" className={opsStyles.searchClearBtn} onClick={clearSearch}><X size={14} /></button> : null}
                </div>
                <BackendSearchButton label={t("ops.search")} onClick={handleSearch} />
              </div>

              <div className={supplierStyles.supplierInventoryFilterGroup} role="group" aria-label={t("ops.inventoryLogsAllType")}>
                <BackendCombobox
                  aria-label={t("ops.inventoryLogsAllType")}
                  value={typeFilter}
                  onChange={(value) => { setTypeFilter(value); setPage(1); }}
                  options={[{ value: "", label: t("ops.inventoryLogsAllType") }, ...TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))]}
                  emptyLabel={t("ops.comboboxNoResults")}
                  placeholder={t("ops.inventoryLogsAllType")}
                  variant="filter"
                />
              </div>
            </div>
          )}
          footer={(!loading && !error && logs.length > 0) ? (
            <div className={opsStyles.pagination}>
              <span className={opsStyles.paginationInfo}>{t("ops.apiKeysPaginationInfo", { total, page, totalPages })}</span>
              <div className={opsStyles.paginationControls}>
                <BackendPageSizeSelect label={t("ops.apiKeysPerPage")} value={pageSize} options={PAGE_SIZE_OPTIONS} onChange={(value) => { setPageSize(value); setPage(1); }} />
                <button className={opsStyles.pageBtn} disabled={page <= 1} onClick={() => goPage(page - 1)}><ChevronLeft size={14} /></button>
                <BackendPaginationNumbers page={page} totalPages={totalPages} onPageChange={goPage} />
                <button className={opsStyles.pageBtn} disabled={page >= totalPages} onClick={() => goPage(page + 1)}><ChevronRight size={14} /></button>
              </div>
            </div>
          ) : undefined}
        >

          {loading ? (<SupplierTableSkeleton label={t("ops.inventoryLogsLoading")} />)
        : error ? (<SupplierErrorState title={error} description="" />)
        : logs.length === 0 ? (<SupplierEmptyState title={t("ops.inventoryLogsEmpty")} description="" />)
        : (
            <div className={opsStyles.tableWrapper}>
              <Table className={`${opsStyles.dataTable} ${opsStyles.supplierInventoryLogsTable}`}>
                <TableHeader><TableRow>
                  <TableHead>{t("ops.inventoryLogsColProduct")}</TableHead>
                  <TableHead>{t("ops.inventoryLogsColSku")}</TableHead>
                  <TableHead>{t("ops.inventoryLogsColType")}</TableHead>
                  <TableHead>{t("ops.inventoryLogsColQuantity")}</TableHead>
                  <TableHead>{t("ops.inventoryLogsColReason")}</TableHead>
                  <TableHead>{t("ops.inventoryLogsColRef")}</TableHead>
                  <TableHead>{t("ops.inventoryLogsColBy")}</TableHead>
                  <TableHead>{t("ops.inventoryLogsColCreated")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell><TruncatedCell>{log.product_name}</TruncatedCell></TableCell>
                      <TableCell><TruncatedCell>{log.sku_code}</TruncatedCell></TableCell>
                      <TableCell>
                        <BackendStatusBadge tone={log.type === "inbound" ? "info" : "neutral"}>
                          {log.type === "inbound" ? "入库" : log.type === "outbound" ? "出库" : log.type === "adjustment" ? "调整" : log.type}
                        </BackendStatusBadge>
                      </TableCell>
                      <TableCell style={{ fontWeight: 500, color: log.quantity >= 0 ? "#2e7d32" : "#c62828" }}>{log.quantity >= 0 ? `+${log.quantity}` : String(log.quantity)}</TableCell>
                      <TableCell><TruncatedCell>{log.reason || "—"}</TruncatedCell></TableCell>
                      <TableCell><TruncatedCell>{log.reference_id || "—"}</TruncatedCell></TableCell>
                      <TableCell><TruncatedCell>{log.created_by || "—"}</TruncatedCell></TableCell>
                      <TableCell style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{formatDatetime(log.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
        )}
        </BackendDataSurface>
      </div>
    </div>
  );
}
