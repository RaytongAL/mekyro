import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, ClipboardList } from "lucide-react";
import { BackendPaginationNumbers } from "@/components/backend-ui/backend-pagination";
import i18n from "@/i18n";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BackendPageSizeSelect } from "./backend-select";
import { TruncatedCell } from "./truncated-cell";
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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skuId: number | null;
  skuCode?: string;
  productName?: string;
};

export function InventoryLogsDrawer({ open, onOpenChange, skuId, skuCode, productName }: Props) {
  const { t } = useTranslation();
  const locale = i18n.language;
  const { selectedWorkspaceId } = useWorkspace();

  const [logs, setLogs] = useState<InventoryLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchLogs = useCallback(() => {
    if (!skuId || !selectedWorkspaceId) return;
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
      sku_id: String(skuId),
      workspace_id: selectedWorkspaceId,
      ordering: "-id",
    });
    fetch(`/api/internal/inventory-logs/?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.code === 200 && data.data) {
          setLogs(data.data.results ?? []);
          setTotal(data.data.total ?? 0);
        } else {
          setError(data?.message ?? t("ops.inventoryLogsFetchFailed"));
        }
      })
      .catch(() => setError(t("ops.inventoryLogsFetchFailed")))
      .finally(() => setLoading(false));
  }, [skuId, selectedWorkspaceId, page, pageSize, t]);

  useEffect(() => {
    if (open && skuId) fetchLogs();
  }, [open, skuId, fetchLogs]);

  useEffect(() => {
    setPage(1);
  }, [skuId]);

  function goPage(p: number) {
    setPage(Math.max(1, Math.min(p, totalPages)));
  }
  function formatDatetime(iso: string): string {
    return iso ? new Date(iso).toLocaleString(locale) : "—";
  }
  function typeLabel(v: string) {
    const o = TYPE_OPTIONS.find((x) => x.value === v);
    return o ? (locale === "zh-CN" ? o.label : o.labelEn) : v;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={styles.opsDrawerContent}>
        <SheetHeader className={styles.categoryDrawerHeader}>
          <SheetTitle className={styles.inventoryDrawerTitle}>
            <ClipboardList size={16} aria-hidden="true" />
            {t("ops.productInventoryLogs")}
          </SheetTitle>
          <SheetDescription>
            {productName ? `${productName} — ` : ""}
            {skuCode ? <code style={{ fontSize: 12 }}>{skuCode}</code> : ""}
          </SheetDescription>
        </SheetHeader>

        <div className={styles.categoryDrawerBody}>
          {loading ? (
            <p className={styles.loadingText}>{t("common.loading")}</p>
          ) : error ? (
            <p className={styles.loadingText}>{error}</p>
          ) : logs.length === 0 ? (
            <p className={styles.emptyText}>{t("ops.inventoryLogsEmpty")}</p>
          ) : (
            <>
              <div className={styles.tableWrapper}>
                <Table className={`${styles.dataTable} ${styles.inventoryLogsDrawerTable}`}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
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
                        <TableCell>
                          <span className={styles.logTypeBadge} data-type={item.type}>{typeLabel(item.type)}</span>
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
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
