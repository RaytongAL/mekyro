import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlignLeft,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Heading,
  Search,
  X,
} from "lucide-react";
import i18n from "@/i18n";
import { BackendDataSurface } from "@/components/backend-ui/backend-data-surface";
import { BackendSearchButton } from "@/components/backend-ui/backend-search-button";
import { BackendPaginationNumbers } from "@/components/backend-ui/backend-pagination";
import { BackendStatusBadge } from "@/components/backend-ui/backend-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BackendPageSizeSelect } from "../ops-shell/backend-select";
import {
  SupplierEmptyState,
  SupplierErrorState,
  SupplierTableSkeleton,
} from "./supplier-state-panel";
import opsStyles from "../ops-shell/ops-shell.module.css";
import supplierStyles from "./supplier-shell.module.css";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const TYPE_OPTIONS = [
  { value: "ai_outbound", label: "AI 主动联系", labelEn: "AI Outbound" },
  { value: "human_outbound", label: "人工主动联系", labelEn: "Human Outbound" },
  { value: "customer_inbound", label: "客户回复", labelEn: "Customer Inbound" },
];

const CHANNEL_OPTIONS = [
  { value: "email", label: "邮件", labelEn: "Email" },
  { value: "whatsapp", label: "WhatsApp", labelEn: "WhatsApp" },
  { value: "phone", label: "电话", labelEn: "Phone" },
];

type ContactLogItem = {
  id: number;
  ws_lead_id: number;
  lead_merchant_name: string;
  type: string;
  channel: string;
  email_title: string;
  email_sender: string;
  email_recipient: string;
  content: string;
  created_at: string;
};

function getToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)ai_trade_token=([^;]*)/);
  return match?.[1] ?? null;
}

export function SupplierContactLogsPage() {
  const { t } = useTranslation();
  const locale = i18n.language;

  const [logs, setLogs] = useState<ContactLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [ordering] = useState("-id");

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchLogs = useCallback(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }

    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize), ordering });
    if (search) params.set("search", search);

    fetch(`/api/supplier/contact-logs/?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.code === 200 && data.data) {
          setLogs(data.data.results ?? []);
          setTotal(data.data.total ?? 0);
        } else {
          setError(data?.message ?? "获取联系记录失败");
        }
      })
      .catch(() => setError("获取联系记录失败"))
      .finally(() => setLoading(false));
  }, [page, pageSize, search, ordering]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  function handleSearch() { setSearch(searchInput.trim()); setPage(1); }
  function clearSearch() { setSearchInput(""); setSearch(""); setPage(1); }
  function goPage(p: number) { setPage(Math.max(1, Math.min(p, totalPages))); }

  function formatDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }

  const typeLabel = (v: string) => {
    const opt = TYPE_OPTIONS.find((o) => o.value === v);
    return opt ? (locale === "zh-CN" ? opt.label : opt.labelEn) : v;
  };

  const channelLabel = (v: string) => {
    const opt = CHANNEL_OPTIONS.find((o) => o.value === v);
    return opt ? (locale === "zh-CN" ? opt.label : opt.labelEn) : v;
  };

  const isZh = locale === "zh-CN";
  const pageCopy = isZh
    ? {
        emptyTitle: "暂无联系记录",
        emptyDescription: "当前搜索条件下没有联系记录。调整搜索条件后可继续查看邮件、WhatsApp 和电话跟进记录。",
        errorTitle: "联系记录暂不可用",
        errorDescription: "联系记录暂时无法加载，请稍后重试或调整搜索条件。",
      }
    : {
        emptyTitle: "No contact logs",
        emptyDescription: "No contact logs match the current search. Adjust the search to continue reviewing email, WhatsApp, and phone follow-ups.",
        errorTitle: "Contact logs unavailable",
        errorDescription: "The contact logs could not be loaded. Try again later or adjust the search.",
      };

  return (
    <div className={`${opsStyles.whiteCard} ${supplierStyles.supplierListCard}`}>
      <BackendDataSurface
        toolbar={(
          <div className={supplierStyles.supplierFilterToolbar}>
        <label className={supplierStyles.supplierSearchBox}>
          <Search size={14} aria-hidden="true" />
          <Input
            type="text"
            className={supplierStyles.supplierSearchInput}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            placeholder={t("supplier.searchContactLogsPlaceholder")}
          />
          {searchInput ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={clearSearch}
              aria-label={isZh ? "清空搜索" : "Clear search"}
            >
              <X aria-hidden="true" />
            </Button>
          ) : null}
        </label>
        <BackendSearchButton label={t("supplier.search")} onClick={handleSearch} />
          </div>
        )}
        footer={(!loading && !error && logs.length > 0) ? (
          <div className={opsStyles.pagination}>
            <span className={opsStyles.paginationInfo}>
              {t("supplier.paginationInfo", { total, page, totalPages })}
            </span>
            <div className={opsStyles.paginationControls}>
              <BackendPageSizeSelect
                label={t("supplier.perPage")}
                value={pageSize}
                options={PAGE_SIZE_OPTIONS}
                onChange={(value) => { setPageSize(value); setPage(1); }}
              />
              <button className={opsStyles.pageBtn} disabled={page <= 1} onClick={() => goPage(page - 1)}>
                <ChevronLeft size={14} />
              </button>
              <BackendPaginationNumbers page={page} totalPages={totalPages} onPageChange={goPage} />
              <button className={opsStyles.pageBtn} disabled={page >= totalPages} onClick={() => goPage(page + 1)}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        ) : undefined}
      >

        {loading ? (
        <SupplierTableSkeleton label={t("supplier.loading")} />
      ) : error ? (
        <SupplierErrorState
          title={pageCopy.errorTitle}
          description={pageCopy.errorDescription}
        />
      ) : logs.length === 0 ? (
        <SupplierEmptyState
          title={pageCopy.emptyTitle}
          description={pageCopy.emptyDescription}
        />
      ) : (
          <div className={`${opsStyles.tableWrapper} ${opsStyles.contactLogsTableWrapper} ${supplierStyles.supplierDataTableWrapper}`}>
            <Table className={`${opsStyles.dataTable} ${opsStyles.contactLogsTable} ${supplierStyles.supplierContactLogTable}`}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ops.contactLogsColMerchant")}</TableHead>
                  <TableHead>{t("ops.contactLogsColType")}</TableHead>
                  <TableHead>{t("ops.contactLogsColChannel")}</TableHead>
                  <TableHead>{t("ops.contactLogsColParticipants")}</TableHead>
                  <TableHead>{t("ops.contactLogsColContent")}</TableHead>
                  <TableHead>{t("ops.contactLogsColCreated")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <span className={opsStyles.contactLogMerchantText} title={item.lead_merchant_name || undefined}>
                        {item.lead_merchant_name || "—"}
                      </span>
                    </TableCell>
                    <TableCell className={opsStyles.contactLogTypeCell}>
                      <BackendStatusBadge tone="neutral">
                        {typeLabel(item.type)}
                      </BackendStatusBadge>
                    </TableCell>
                    <TableCell className={opsStyles.contactLogChannelCell}>{channelLabel(item.channel)}</TableCell>
                    <TableCell>
                      <div className={opsStyles.leadInfoStack}>
                        <div className={`${opsStyles.leadInfoRow} ${opsStyles.contactLogInfoRow}`} aria-label={`${t("ops.contactLogsColEmailSender")}: ${item.email_sender || "—"}`}>
                          <ArrowUpRight aria-hidden="true" />
                          <span title={item.email_sender || undefined}>{item.email_sender || "—"}</span>
                        </div>
                        <div className={`${opsStyles.leadInfoRow} ${opsStyles.contactLogInfoRow}`} aria-label={`${t("ops.contactLogsColEmailRecipient")}: ${item.email_recipient || "—"}`}>
                          <ArrowDownLeft aria-hidden="true" />
                          <span title={item.email_recipient || undefined}>{item.email_recipient || "—"}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={opsStyles.leadInfoStack}>
                        <div className={`${opsStyles.leadInfoRow} ${opsStyles.contactLogInfoRow}`} aria-label={`${t("ops.contactLogsColEmailTitle")}: ${item.email_title || "—"}`}>
                          <Heading aria-hidden="true" />
                          <span title={item.email_title || undefined}>{item.email_title || "—"}</span>
                        </div>
                        <div className={`${opsStyles.leadInfoRow} ${opsStyles.contactLogInfoRow} ${opsStyles.contactLogBodyRow}`} aria-label={`${t("ops.contactLogsColContent")}: ${item.content || "—"}`}>
                          <AlignLeft aria-hidden="true" />
                          <span title={item.content || undefined}>{item.content || "—"}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className={opsStyles.contactLogCreatedCell}>
                      {formatDate(item.created_at)}
                    </TableCell>
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
