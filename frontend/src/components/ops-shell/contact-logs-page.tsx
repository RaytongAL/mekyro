import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlignLeft,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Heading,
  Loader2,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { BackendPageSizeSelect } from "./backend-select";
import { useWorkspace } from "./workspace-context";
import styles from "./ops-shell.module.css";

/* ---------- 常量 ---------- */
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

/* ---------- 类型 ---------- */
type ContactLogItem = {
  id: number;
  ws_lead_id: number;
  merchant_name: string;
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

export function ContactLogsPage() {
  const { t } = useTranslation();
  const locale = i18n.language;
  const { selectedWorkspaceId } = useWorkspace();
  const clearSearchLabel = locale === "zh-CN" ? "清空搜索" : "Clear search";
  const previousPageLabel = locale === "zh-CN" ? "上一页" : "Previous page";
  const nextPageLabel = locale === "zh-CN" ? "下一页" : "Next page";

  /* ---- 列表 ---- */
  const [logs, setLogs] = useState<ContactLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [ordering, setOrdering] = useState("-id");
  const [typeFilter, setTypeFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");

  /* ---- 编辑 ---- */
  const [editTarget, setEditTarget] = useState<ContactLogItem | null>(null);
  const [editType, setEditType] = useState("");
  const [editChannel, setEditChannel] = useState("");
  const [editEmailTitle, setEditEmailTitle] = useState("");
  const [editEmailSender, setEditEmailSender] = useState("");
  const [editEmailRecipient, setEditEmailRecipient] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");

  /* ---- 删除 ---- */
  const [deleteTarget, setDeleteTarget] = useState<ContactLogItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  /* ==================== 数据获取 ==================== */

  const fetchLogs = useCallback(() => {
    const token = getToken();
    if (!token || !selectedWorkspaceId) { setLoading(false); return; }

    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize), ordering });
    params.set("workspace_id", selectedWorkspaceId);
    if (search) params.set("search", search);
    if (typeFilter) params.set("type", typeFilter);
    if (channelFilter) params.set("channel", channelFilter);

    fetch(`/api/internal/contact-logs/?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.code === 200 && data.data) {
          setLogs(data.data.results ?? []);
          setTotal(data.data.total ?? 0);
        } else {
          setError(data?.message ?? t("ops.contactLogsFetchFailed"));
        }
      })
      .catch(() => setError(t("ops.contactLogsFetchFailed")))
      .finally(() => setLoading(false));
  }, [page, pageSize, search, ordering, typeFilter, channelFilter, selectedWorkspaceId, t]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  /* ==================== 搜索 ==================== */

  function handleSearch() {
    setSearch(searchInput.trim());
    setPage(1);
  }

  function clearSearch() {
    setSearchInput("");
    setSearch("");
    setPage(1);
  }

  /* ==================== 编辑 ==================== */

  function openEdit(item: ContactLogItem) {
    setEditTarget(item);
    setEditType(item.type);
    setEditChannel(item.channel);
    setEditEmailTitle(item.email_title || "");
    setEditEmailSender(item.email_sender || "");
    setEditEmailRecipient(item.email_recipient || "");
    setEditContent(item.content);
    setEditError("");
  }

  async function handleEdit() {
    if (!editTarget) return;
    const token = getToken();
    if (!token) return;

    setEditing(true);
    setEditError("");
    try {
      const res = await fetch(`/api/internal/contact-logs/${editTarget.id}/update/`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: editType,
          channel: editChannel,
          email_title: editEmailTitle,
          email_sender: editEmailSender,
          email_recipient: editEmailRecipient,
          content: editContent,
        }),
      });
      const data = await res.json();
      if (data?.code === 200) {
        setEditTarget(null);
        fetchLogs();
      } else {
        setEditError(data?.message ?? t("ops.contactLogsUpdateFailed"));
      }
    } catch {
      setEditError(t("ops.contactLogsUpdateFailed"));
    } finally {
      setEditing(false);
    }
  }

  /* ==================== 删除 ==================== */

  async function confirmDelete() {
    if (!deleteTarget) return;
    const token = getToken();
    if (!token) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/internal/contact-logs/${deleteTarget.id}/delete/`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data?.code === 200) {
        setLogs((prev) => prev.filter((l) => l.id !== deleteTarget.id));
        setTotal((prev) => prev - 1);
      }
    } catch { /* ignore */ } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  /* ==================== 分页 ==================== */

  function goPage(p: number) { setPage(Math.max(1, Math.min(p, totalPages))); }

  /* ==================== 渲染辅助 ==================== */

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

  /* ==================== JSX ==================== */

  return (
    <div className={`${styles.whiteCard} ${styles.dataPage}`}>
      <BackendDataSurface
        toolbar={(
          <div className={`${styles.searchBar} ${styles.opsWorkbenchToolbar}`}>
        <div className={styles.opsSearchGroup} role="search">
          <InputGroup className={styles.searchInputGroup}>
            <InputGroupInput
              type="text"
              className={styles.searchInput}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              placeholder={t("ops.contactLogsSearchPlaceholder")}
            />
            <InputGroupAddon align="inline-start">
              <Search />
            </InputGroupAddon>
            {searchInput ? (
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="icon-xs" aria-label={clearSearchLabel} onClick={clearSearch}>
                  <X />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
          <BackendSearchButton label={t("ops.search")} onClick={handleSearch} />
        </div>
        <div className={styles.opsFilterGroup} role="group" aria-label={t("ops.productsFilterLabel")}>
          <BackendCombobox
            aria-label={t("ops.contactLogsColType")}
            value={typeFilter}
            onChange={(value) => { setTypeFilter(value); setPage(1); }}
            options={[
              { value: "", label: t("ops.contactLogsAllTypes") },
              ...TYPE_OPTIONS.map((o) => ({ value: o.value, label: locale === "zh-CN" ? o.label : o.labelEn })),
            ]}
            emptyLabel={t("ops.comboboxNoResults")}
            placeholder={t("ops.contactLogsAllTypes")}
            variant="filter"
          />
          <BackendCombobox
            aria-label={t("ops.contactLogsColChannel")}
            value={channelFilter}
            onChange={(value) => { setChannelFilter(value); setPage(1); }}
            options={[
              { value: "", label: t("ops.contactLogsAllChannels") },
              ...CHANNEL_OPTIONS.map((o) => ({ value: o.value, label: locale === "zh-CN" ? o.label : o.labelEn })),
            ]}
            emptyLabel={t("ops.comboboxNoResults")}
            placeholder={t("ops.contactLogsAllChannels")}
            variant="filter"
          />
        </div>
          </div>
        )}
        footer={(!loading && !error && logs.length > 0) ? (
          <div className={styles.pagination}>
            <span className={styles.paginationInfo}>
              {search ? t("ops.leadsPaginationInfoWithSearch", { total, page, totalPages, search }) : t("ops.apiKeysPaginationInfo", { total, page, totalPages })}
            </span>
            <div className={styles.paginationControls}>
              <BackendPageSizeSelect
                label={t("ops.apiKeysPerPage")}
                value={pageSize}
                options={PAGE_SIZE_OPTIONS}
                onChange={(value) => {
                  setPageSize(value);
                  setPage(1);
                }}
              />
              <Pagination className={styles.paginationNav}>
                <PaginationContent>
                  <PaginationItem>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className={styles.pageBtn}
                      disabled={page <= 1}
                      aria-label={previousPageLabel}
                      onClick={() => goPage(page - 1)}
                    >
                      <ChevronLeft data-icon="inline-start" />
                    </Button>
                  </PaginationItem>
                  <PaginationItem>
                    <BackendPaginationNumbers page={page} totalPages={totalPages} onPageChange={goPage} />
                  </PaginationItem>
                  <PaginationItem>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className={styles.pageBtn}
                      disabled={page >= totalPages}
                      aria-label={nextPageLabel}
                      onClick={() => goPage(page + 1)}
                    >
                      <ChevronRight data-icon="inline-end" />
                    </Button>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>
        ) : undefined}
      >

        {loading ? (
        <BackendTableSkeleton label={t("common.loading")} />
      ) : error ? (
        <BackendErrorState title={error} />
      ) : logs.length === 0 ? (
        <BackendEmptyState title={t("ops.contactLogsEmpty")} />
      ) : (
          <div className={`${styles.tableWrapper} ${styles.contactLogsTableWrapper}`}>
            <Table className={`${styles.dataTable} ${styles.contactLogsTable}`}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ops.contactLogsColMerchant")}</TableHead>
                  <TableHead>{t("ops.contactLogsColType")}</TableHead>
                  <TableHead>{t("ops.contactLogsColChannel")}</TableHead>
                  <TableHead>{t("ops.contactLogsColParticipants")}</TableHead>
                  <TableHead>{t("ops.contactLogsColContent")}</TableHead>
                  <TableHead>{t("ops.contactLogsColCreated")}</TableHead>
                  <TableHead>{t("ops.apiKeysColActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <span className={styles.contactLogMerchantText} title={item.merchant_name || undefined}>
                        {item.merchant_name || "—"}
                      </span>
                    </TableCell>
                    <TableCell className={styles.contactLogTypeCell}>
                      <BackendStatusBadge tone="neutral">
                        {typeLabel(item.type)}
                      </BackendStatusBadge>
                    </TableCell>
                    <TableCell className={styles.contactLogChannelCell}>{channelLabel(item.channel)}</TableCell>
                    <TableCell>
                      <div className={styles.leadInfoStack}>
                        <div className={`${styles.leadInfoRow} ${styles.contactLogInfoRow}`} aria-label={`${t("ops.contactLogsColEmailSender")}: ${item.email_sender || "—"}`}>
                          <ArrowUpRight aria-hidden="true" />
                          <span title={item.email_sender || undefined}>{item.email_sender || "—"}</span>
                        </div>
                        <div className={`${styles.leadInfoRow} ${styles.contactLogInfoRow}`} aria-label={`${t("ops.contactLogsColEmailRecipient")}: ${item.email_recipient || "—"}`}>
                          <ArrowDownLeft aria-hidden="true" />
                          <span title={item.email_recipient || undefined}>{item.email_recipient || "—"}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={styles.leadInfoStack}>
                        <div className={`${styles.leadInfoRow} ${styles.contactLogInfoRow}`} aria-label={`${t("ops.contactLogsColEmailTitle")}: ${item.email_title || "—"}`}>
                          <Heading aria-hidden="true" />
                          <span title={item.email_title || undefined}>{item.email_title || "—"}</span>
                        </div>
                        <div className={`${styles.leadInfoRow} ${styles.contactLogInfoRow} ${styles.contactLogBodyRow}`} aria-label={`${t("ops.contactLogsColContent")}: ${item.content || "—"}`}>
                          <AlignLeft aria-hidden="true" />
                          <span title={item.content || undefined}>{item.content || "—"}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className={styles.contactLogCreatedCell}>
                      {formatDate(item.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className={`${styles.actionButtons} ${styles.contactLogActionButtons}`}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className={styles.contactLogIconAction}
                          aria-label={t("ops.apiKeysEdit")}
                          title={t("ops.apiKeysEdit")}
                          onClick={() => openEdit(item)}
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className={styles.contactLogIconAction}
                          aria-label={t("ops.apiKeysDelete")}
                          title={t("ops.apiKeysDelete")}
                          onClick={() => setDeleteTarget(item)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
      )}
      </BackendDataSurface>

      {/* 编辑对话框 */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className={styles.createDialog}>
          <DialogHeader>
            <DialogTitle>{t("ops.contactLogsEditTitle")}</DialogTitle>
            <DialogDescription>
              #{editTarget?.id} ({t("ops.contactLogsColLead")}: #{editTarget?.ws_lead_id})
            </DialogDescription>
          </DialogHeader>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t("ops.contactLogsColType")}</label>
            <BackendCombobox
              aria-label={t("ops.contactLogsColType")}
              value={editType}
              onChange={setEditType}
              options={TYPE_OPTIONS.map((option) => ({
                value: option.value,
                label: locale === "zh-CN" ? option.label : option.labelEn,
              }))}
              emptyLabel={t("ops.comboboxNoResults")}
              placeholder={t("ops.contactLogsColType")}
              variant="form"
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t("ops.contactLogsColChannel")}</label>
            <BackendCombobox
              aria-label={t("ops.contactLogsColChannel")}
              value={editChannel}
              onChange={setEditChannel}
              options={CHANNEL_OPTIONS.map((option) => ({
                value: option.value,
                label: locale === "zh-CN" ? option.label : option.labelEn,
              }))}
              emptyLabel={t("ops.comboboxNoResults")}
              placeholder={t("ops.contactLogsColChannel")}
              variant="form"
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t("ops.contactLogsColEmailTitle")}</label>
            <Input className={styles.formInput} value={editEmailTitle} onChange={(e) => setEditEmailTitle(e.target.value)} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t("ops.contactLogsColEmailSender")}</label>
            <Input className={styles.formInput} value={editEmailSender} onChange={(e) => setEditEmailSender(e.target.value)} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t("ops.contactLogsColEmailRecipient")}</label>
            <Input className={styles.formInput} value={editEmailRecipient} onChange={(e) => setEditEmailRecipient(e.target.value)} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t("ops.contactLogsColContent")}</label>
            <Textarea className={styles.formTextarea} value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={4} />
          </div>

          {editError ? <p className={styles.formError}>{editError}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editing}>{t("common.cancel")}</Button>
            <Button onClick={handleEdit} disabled={editing}>
              {editing ? <Loader2 data-icon="inline-start" className={styles.spinIcon} /> : null}
              {t("ops.apiKeysConfirmEdit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className={styles.createDialog} showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("ops.contactLogsDeleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("ops.contactLogsDeleteConfirm", { id: deleteTarget?.id ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Loader2 data-icon="inline-start" className={styles.spinIcon} /> : null}
              {t("ops.apiKeysConfirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
