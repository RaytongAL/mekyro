import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Building2,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  MessageSquareText,
  Phone,
  Search,
  Store,
  UserRound,
  X,
} from "lucide-react";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BackendPageSizeSelect } from "./backend-select";
import { Drawer } from "./drawer";
import { useWorkspace } from "./workspace-context";

import styles from "./ops-shell.module.css";
import { COUNTRY_OPTIONS } from "@/lib/countries";

/* ---------- 常量 ---------- */
const PAGE_SIZE_OPTIONS = [10, 20, 50];

const STAGE_OPTIONS = [
  { value: "new", label: "新线索", labelEn: "New" },
  { value: "contacting", label: "联系中", labelEn: "Contacting" },
  { value: "replied", label: "已回复", labelEn: "Replied" },
  { value: "qualified", label: "有意向", labelEn: "Qualified" },
  { value: "quoting", label: "报价中", labelEn: "Quoting" },
  { value: "ordered", label: "已成单", labelEn: "Ordered" },
  { value: "lost", label: "已流失", labelEn: "Lost" },
];

const CONTACT_TYPE_OPTIONS = [
  { value: "ai_outbound", label: "AI 外联", labelEn: "AI outreach" },
  { value: "human_outbound", label: "人工外联", labelEn: "Manual outreach" },
  { value: "customer_inbound", label: "客户回复", labelEn: "Customer reply" },
];

const CONTACT_CHANNEL_OPTIONS = [
  { value: "email", label: "邮件", labelEn: "Email" },
  { value: "whatsapp", label: "WhatsApp", labelEn: "WhatsApp" },
  { value: "phone", label: "电话", labelEn: "Phone" },
];

function scoreTier(score: number | null | undefined): "high" | "medium" | "low" {
  const value = Number(score ?? 0);
  if (value >= 80) return "high";
  if (value >= 60) return "medium";
  return "low";
}

function formatPhone(countryCode: string, phone: string): string {
  const parts = [countryCode?.trim(), phone?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "—";
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

/* ---------- 类型 ---------- */
type LeadItem = {
  id: number;
  workspace_id: number;
  workspace_name: string;
  platform: string;
  merchant_id: string;
  merchant_name: string;
  company_name: string;
  contact_person: string;
  country: string;
  city: string;
  zip_code: string;
  description: string;
  phone: string;
  country_code: string;
  email: string;
  whatsapp: string;
  stage: string;
  recommendation_score: number;
  recommendation_reason: string;
  created_at: string;
  updated_at: string;
  latest_contact_at: string | null;
};

function getToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)ai_trade_token=([^;]*)/);
  return match?.[1] ?? null;
}

export function LeadsPage() {
  const { t } = useTranslation();
  const locale = i18n.language;
  const { selectedWorkspaceId } = useWorkspace();

  /* ---- 列表 ---- */
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [ordering] = useState("-id");

  /* ---- 编辑 ---- */
  const [editTarget, setEditTarget] = useState<LeadItem | null>(null);
  const [editPlatform, setEditPlatform] = useState("");
  const [editMerchantId, setEditMerchantId] = useState("");
  const [editMerchantName, setEditMerchantName] = useState("");
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editContactPerson, setEditContactPerson] = useState("");
  const [editCountry, setEditCountry] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editZipCode, setEditZipCode] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCountryCode, setEditCountryCode] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editWhatsapp, setEditWhatsapp] = useState("");
  const [editStage, setEditStage] = useState("");
  const [editScore, setEditScore] = useState(0);
  const [editReason, setEditReason] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");

  /* ---- 删除 ---- */
  const [deleteTarget, setDeleteTarget] = useState<LeadItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ---- 联系记录抽屉 ---- */
  const [contactDrawerLead, setContactDrawerLead] = useState<LeadItem | null>(null);
  const [contactLogs, setContactLogs] = useState<any[]>([]);
  const [contactLogsLoading, setContactLogsLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  /* ==================== 数据获取 ==================== */

  const fetchLeads = useCallback(() => {
    const token = getToken();
    if (!token || !selectedWorkspaceId) { setLoading(false); return; }

    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (search) params.set("search", search);
    params.set("workspace_id", selectedWorkspaceId);
    if (countryFilter) params.set("country", countryFilter);
    params.set("ordering", ordering);

    fetch(`/api/internal/leads/?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.code === 200 && data.data) {
          setLeads(data.data.results ?? []);
          setTotal(data.data.total ?? 0);
        } else {
          setError(data?.message ?? t("ops.leadsFetchFailed"));
        }
      })
      .catch(() => setError(t("ops.leadsFetchFailed")))
      .finally(() => setLoading(false));
  }, [page, pageSize, search, selectedWorkspaceId, countryFilter, ordering, t]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

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

  function openEdit(item: LeadItem) {
    setEditTarget(item);
    setEditPlatform(item.platform);
    setEditMerchantId(item.merchant_id);
    setEditMerchantName(item.merchant_name);
    setEditCompanyName(item.company_name);
    setEditContactPerson(item.contact_person);
    setEditCountry(item.country);
    setEditCity(item.city);
    setEditZipCode(item.zip_code);
    setEditPhone(item.phone);
    setEditCountryCode(item.country_code || "");
    setEditEmail(item.email);
    setEditWhatsapp(item.whatsapp);
    setEditStage(item.stage);
    setEditScore(item.recommendation_score);
    setEditReason(item.recommendation_reason);
    setEditDescription(item.description);
    setEditError("");
  }

  async function handleEdit() {
    if (!editTarget) return;
    const token = getToken();
    if (!token) return;

    setEditing(true);
    setEditError("");
    try {
      const res = await fetch(`/api/internal/leads/${editTarget.id}/update/`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: editPlatform,
          merchant_id: editMerchantId,
          merchant_name: editMerchantName,
          company_name: editCompanyName,
          contact_person: editContactPerson,
          country: editCountry,
          city: editCity,
          zip_code: editZipCode,
          phone: editPhone,
          country_code: editCountryCode,
          email: editEmail,
          whatsapp: editWhatsapp,
          stage: editStage,
          recommendation_score: editScore,
          recommendation_reason: editReason,
          description: editDescription,
        }),
      });
      const data = await res.json();
      if (data?.code === 200) {
        setEditTarget(null);
        fetchLeads();
      } else {
        setEditError(data?.message ?? t("ops.leadsUpdateFailed"));
      }
    } catch {
      setEditError(t("ops.leadsUpdateFailed"));
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
      const res = await fetch(`/api/internal/leads/${deleteTarget.id}/delete/`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data?.code === 200) {
        setLeads((prev) => prev.filter((l) => l.id !== deleteTarget.id));
        setTotal((prev) => prev - 1);
      }
    } catch { /* ignore */ } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  /* ==================== 联系记录抽屉 ==================== */

  function openContactLogs(item: LeadItem) {
    setContactDrawerLead(item);
    setContactLogs([]);
    fetchContactLogs(item.id);
  }

  function closeContactLogs() {
    setContactDrawerLead(null);
    setContactLogs([]);
  }

  async function fetchContactLogs(leadId: number) {
    const token = getToken();
    if (!token) return;
    setContactLogsLoading(true);
    try {
      const res = await fetch(`/api/internal/contact-logs/?lead_id=${leadId}&page_size=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data?.code === 200 && data.data) {
        setContactLogs(data.data.results ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setContactLogsLoading(false);
    }
  }

  /* ==================== 分页 ==================== */

  function goPage(p: number) { setPage(Math.max(1, Math.min(p, totalPages))); }

  /* ==================== 渲染辅助 ==================== */

  function formatDatetime(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(locale);
  }

  function formatDate(iso: string | null): string {
    if (!iso) return "—";
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  }

  const stageLabel = (v: string) => {
    const opt = STAGE_OPTIONS.find((o) => o.value === v);
    return opt ? (locale === "zh-CN" ? opt.label : opt.labelEn) : v;
  };

  const countryLabel = (v: string) => {
    const opt = COUNTRY_OPTIONS.find((o) => o.value === v);
    return opt ? (locale === "zh-CN" ? opt.label : opt.labelEn) : v;
  };

  const contactTypeLabel = (v: string) => {
    const opt = CONTACT_TYPE_OPTIONS.find((o) => o.value === v);
    return opt ? (locale === "zh-CN" ? opt.label : opt.labelEn) : v;
  };
  const contactChannelLabel = (v: string) => {
    const opt = CONTACT_CHANNEL_OPTIONS.find((o) => o.value === v);
    return opt ? (locale === "zh-CN" ? opt.label : opt.labelEn) : v;
  };
  const detailTabOverview = locale === "zh-CN" ? "核心信息" : "Overview";
  const detailTabContact = locale === "zh-CN" ? "联系方式" : "Contact";
  const detailTabNotes = locale === "zh-CN" ? "备注" : "Notes";
  const clearSearchLabel = locale === "zh-CN" ? "清空搜索" : "Clear search";

  /* ==================== JSX ==================== */

  return (
    <div className={`${styles.whiteCard} ${styles.dataPage}`}>
      <BackendDataSurface
        toolbar={(
          <div className={`${styles.searchBar} ${styles.leadsSearchBar}`} role="search">
            <InputGroup className={`${styles.searchInputGroup} ${styles.leadsSearchInputGroup}`}>
              <InputGroupInput
                type="text"
                className={styles.searchInput}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                placeholder={t("ops.leadsSearchPlaceholder")}
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
            <div className={styles.leadsFilterGroup}>
              <BackendCombobox
                className={styles.leadsCountryFilter}
                aria-label={t("ops.leadsAllCountries")}
                value={countryFilter}
                onChange={(value) => {
                  setCountryFilter(value);
                  setPage(1);
                }}
                options={[
                  { value: "", label: t("ops.leadsAllCountries") },
                  ...COUNTRY_OPTIONS.map((c) => ({ value: c.value, label: locale === "zh-CN" ? c.label : c.labelEn })),
                ]}
                emptyLabel={t("ops.comboboxNoResults")}
                placeholder={t("ops.leadsAllCountries")}
                variant="filter"
              />
              <BackendSearchButton label={t("ops.search")} onClick={handleSearch} />
            </div>
          </div>
        )}
        footer={(
          <div className={`${styles.pagination} ${styles.leadsSurfacePagination}`}>
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
              <button className={styles.pageBtn} disabled={page <= 1} onClick={() => goPage(page - 1)}>
                <ChevronLeft size={14} />
              </button>
              <BackendPaginationNumbers page={page} totalPages={totalPages} onPageChange={goPage} />
              <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => goPage(page + 1)}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      >
        {loading ? (
          <BackendTableSkeleton label={t("common.loading")} />
        ) : error ? (
          <BackendErrorState title={error} />
        ) : leads.length === 0 ? (
          <BackendEmptyState title={t("ops.leadsEmpty")} />
        ) : (
          <div className={`${styles.tableWrapper} ${styles.leadsSurfaceTableWrapper}`}>
            <Table className={`${styles.dataTable} ${styles.actionColumnTable} ${styles.compactActionColumn} ${styles.leadsCompactTable} ${styles.leadsMenuTable} ${styles.opsAggregatedLeadsTable}`}>
              <TableHeader>
                <TableRow>
                  <TableHead className={styles.leadsMerchantColumn}>{t("ops.leadsColMerchantInfo")}</TableHead>
                  <TableHead className={styles.leadsCountryColumn}>{t("ops.leadsColCountry")}</TableHead>
                  <TableHead className={styles.leadsContactColumn}>{t("ops.leadsColContactMethods")}</TableHead>
                  <TableHead className={styles.leadsTimeColumn}>{t("ops.leadsColTimeline")}</TableHead>
                  <TableHead className={styles.leadsStageColumn}>{t("ops.leadsColStage")}</TableHead>
                  <TableHead className={styles.leadsScoreColumn}>{t("ops.leadsColScore")}</TableHead>
                  <TableHead className={styles.leadsActionColumn}>{t("ops.leadsColDetails")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className={styles.leadInfoStack}>
                        <div className={styles.leadInfoRow} aria-label={`${t("ops.leadsColMerchant")}: ${item.merchant_name || "—"}`}>
                          <Store aria-hidden="true" />
                          <span title={item.merchant_name || undefined}>{item.merchant_name || "—"}</span>
                        </div>
                        <div className={styles.leadInfoRow} aria-label={`${t("ops.leadsColCompany")}: ${item.company_name || "—"}`}>
                          <Building2 aria-hidden="true" />
                          <span title={item.company_name || undefined}>{item.company_name || "—"}</span>
                        </div>
                        <div className={styles.leadInfoRow} aria-label={`${t("ops.leadsColContact")}: ${item.contact_person || "—"}`}>
                          <UserRound aria-hidden="true" />
                          <span title={item.contact_person || undefined}>{item.contact_person || "—"}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={styles.leadLocationCell}>
                        <span>{countryLabel(item.country) || "—"}</span>
                        <span>{item.city || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={styles.leadInfoStack}>
                        <div className={styles.leadInfoRow} aria-label={`${t("ops.leadsColEmail")}: ${item.email || "—"}`}>
                          <Mail aria-hidden="true" />
                          <span title={item.email || undefined}>{item.email || "—"}</span>
                        </div>
                        <div className={styles.leadInfoRow} aria-label={`${t("ops.leadsColWhatsapp")}: ${item.whatsapp || "—"}`}>
                          <WhatsAppIcon className={styles.whatsAppIcon} />
                          <span title={item.whatsapp || undefined}>{item.whatsapp || "—"}</span>
                        </div>
                        <div className={styles.leadInfoRow} aria-label={`${t("ops.leadsColPhone")}: ${formatPhone(item.country_code, item.phone)}`}>
                          <Phone aria-hidden="true" />
                          <span title={formatPhone(item.country_code, item.phone)}>{formatPhone(item.country_code, item.phone)}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={styles.leadInfoStack}>
                        <div className={styles.leadInfoRow} aria-label={`${t("ops.leadsColLatestContact")}: ${formatDate(item.latest_contact_at)}`}>
                          <MessageSquareText aria-hidden="true" />
                          <span>{formatDate(item.latest_contact_at)}</span>
                        </div>
                        <div className={styles.leadInfoRow} aria-label={`${t("ops.leadsColCreated")}: ${formatDate(item.created_at)}`}>
                          <CalendarPlus aria-hidden="true" />
                          <span>{formatDate(item.created_at)}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className={styles.leadsStageCell}>
                      <BackendStatusBadge tone="neutral">
                        {stageLabel(item.stage)}
                      </BackendStatusBadge>
                    </TableCell>
                    <TableCell>
                      <span className={styles.leadScoreCell}>
                        {item.recommendation_score}
                      </span>
                    </TableCell>
                    <TableCell>
                      <BackendRowActions
                        label={t("common.moreActions")}
                        items={[
                          { label: t("ops.leadsDetailTitle"), onSelect: () => openEdit(item) },
                          { label: t("ops.leadsViewContactLogs"), onSelect: () => openContactLogs(item) },
                          { label: t("common.delete"), onSelect: () => setDeleteTarget(item), tone: "destructive" },
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

      <Sheet open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <SheetContent side="right" className={styles.leadDetailSheet}>
          <SheetHeader className={styles.leadDetailHeader}>
            <SheetTitle>{t("ops.leadsDetailTitle")}</SheetTitle>
            <SheetDescription>
              {editTarget?.company_name || editTarget?.merchant_name || "—"} (#{editTarget?.id})
            </SheetDescription>
          </SheetHeader>

          {editTarget ? (
            <div className={styles.leadDetailHero}>
              <div className={styles.leadDetailIdentity}>
                <span className={styles.leadDetailStage} data-stage={editTarget.stage}>
                  {stageLabel(editTarget.stage)}
                </span>
                <h3>{editTarget.merchant_name || editTarget.company_name || `#${editTarget.id}`}</h3>
                <p>{editTarget.company_name || editTarget.merchant_id || "—"}</p>
              </div>
              <div className={styles.leadDetailScoreCard} data-score-tier={scoreTier(editTarget.recommendation_score)}>
                <span>{t("ops.leadsColScore")}</span>
                <strong>{editTarget.recommendation_score}</strong>
              </div>
            </div>
          ) : null}

          <Tabs defaultValue="overview" className={styles.detailTabs}>
            <TabsList className={styles.detailTabsList}>
              <TabsTrigger value="overview">{detailTabOverview}</TabsTrigger>
              <TabsTrigger value="contact">{detailTabContact}</TabsTrigger>
              <TabsTrigger value="notes">{detailTabNotes}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className={styles.detailTabPanel}>
              <div className={styles.detailInfoGrid}>
                <div className={styles.detailInfoItem}>
                  <span>{t("ops.leadsColScore")}</span>
                  <strong>{editTarget?.recommendation_score ?? 0}</strong>
                </div>
                <div className={styles.detailInfoItem}>
                  <span>{t("ops.leadsColPlatform")}</span>
                  <strong>{editTarget?.platform || "—"}</strong>
                </div>
                <div className={styles.detailInfoItem}>
                  <span>{t("ops.leadsColMerchantId")}</span>
                  <strong>{editTarget?.merchant_id || "—"}</strong>
                </div>
                <div className={styles.detailInfoItem}>
                  <span>{t("ops.leadsColMerchant")}</span>
                  <strong>{editTarget?.merchant_name || "—"}</strong>
                </div>
                <div className={styles.detailInfoItem}>
                  <span>{t("ops.leadsColCompany")}</span>
                  <strong>{editTarget?.company_name || "—"}</strong>
                </div>
                <div className={styles.detailInfoItem}>
                  <span>{t("ops.leadsColWorkspace")}</span>
                  <strong>{editTarget?.workspace_name || `#${editTarget?.workspace_id ?? "—"}`}</strong>
                </div>
                <div className={styles.detailInfoItem}>
                  <span>{t("ops.leadsColUpdated")}</span>
                  <strong>{formatDatetime(editTarget?.updated_at ?? null)}</strong>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="contact" className={styles.detailTabPanel}>
              <div className={styles.detailInfoGrid}>
                <div className={styles.detailInfoItem}>
                  <span>{t("ops.leadsColContact")}</span>
                  <strong>{editTarget?.contact_person || "—"}</strong>
                </div>
                <div className={styles.detailInfoItem}>
                  <span>{t("ops.leadsColCountry")}</span>
                  <strong>{countryLabel(editTarget?.country ?? "")}</strong>
                </div>
                <div className={styles.detailInfoItem}>
                  <span>{t("ops.leadsColCity")}</span>
                  <strong>{editTarget?.city || "—"}</strong>
                </div>
                <div className={styles.detailInfoItem}>
                  <span>{t("ops.leadsColZipCode")}</span>
                  <strong>{editTarget?.zip_code || "—"}</strong>
                </div>
                <div className={styles.detailInfoItem}>
                  <span>{t("ops.leadsColPhone")}</span>
                  <strong>{editTarget?.phone || "—"}</strong>
                </div>
                <div className={styles.detailInfoItem}>
                  <span>{t("ops.leadsColCountryCode")}</span>
                  <strong>{editTarget?.country_code || "—"}</strong>
                </div>
                <div className={styles.detailInfoItem}>
                  <span>{t("ops.leadsColEmail")}</span>
                  <strong>{editTarget?.email || "—"}</strong>
                </div>
                <div className={styles.detailInfoItem}>
                  <span>{t("ops.leadsColWhatsapp")}</span>
                  <strong>{editTarget?.whatsapp || "—"}</strong>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="notes" className={styles.detailTabPanel}>
              <div className={styles.detailTextBlock}>
                <span>{t("ops.leadsColReason")}</span>
                <p>{editTarget?.recommendation_reason || "—"}</p>
              </div>
              <div className={styles.detailTextBlock}>
                <span>{t("ops.leadsColDesc")}</span>
                <p>{editTarget?.description || "—"}</p>
              </div>
            </TabsContent>
          </Tabs>

          <SheetFooter className={styles.leadDetailFooter}>
            <Button variant="outline" onClick={() => setEditTarget(null)}>{t("common.close")}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* 删除确认 */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className={styles.createDialog} showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("ops.leadsDeleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("ops.leadsDeleteConfirm", { name: deleteTarget?.company_name ?? "", id: deleteTarget?.id ?? "" })}
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

      {/* ─── 联系记录抽屉 ─── */}
      <Drawer
        open={!!contactDrawerLead}
        onClose={closeContactLogs}
        title={contactDrawerLead ? `${t("ops.leadsViewContactLogs")} — ${contactDrawerLead.merchant_name}` : t("ops.leadsViewContactLogs")}
      >
        {contactLogsLoading ? (
          <div className={styles.loadingText}><Loader2 size={18} className={styles.spinIcon} />{t("common.loading")}</div>
        ) : contactLogs.length === 0 ? (
          <p className={styles.emptyText}>{t("ops.contactLogsEmpty")}</p>
        ) : (
          <div className={styles.timeline}>
            {contactLogs.map((log: any) => (
              <div key={log.id} className={styles.timelineItem}>
                <div className={styles.timelineDot} data-type={log.type} />
                <div className={styles.timelineTime}>
                  {formatDatetime(log.created_at)}
                </div>
                <div className={styles.timelineMeta}>
                  <span className={styles.timelineType} data-type={log.type}>
                    {contactTypeLabel(log.type)}
                  </span>
                  <span className={styles.timelineChannel}>
                    {contactChannelLabel(log.channel)}
                  </span>
                </div>
                <div className={styles.timelineContent}>
                  {log.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}
