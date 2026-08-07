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
  Plus,
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
import { BackendStatusBadge } from "@/components/backend-ui/backend-status-badge";
import { BackendToolbarButton } from "@/components/backend-ui/backend-toolbar-button";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Drawer } from "../ops-shell/drawer";
import { BackendPageSizeSelect } from "../ops-shell/backend-select";
import {
  SupplierEmptyState,
  SupplierErrorState,
  SupplierTableSkeleton,
} from "./supplier-state-panel";

import opsStyles from "../ops-shell/ops-shell.module.css";
import supplierStyles from "./supplier-shell.module.css";

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

type LeadItem = {
  id: string;
  merchant_name: string;
  company_name: string;
  contact_person: string;
  country: string;
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

type LeadDraft = {
  merchant_name: string;
  company_name: string;
  contact_person: string;
  country: string;
  country_code: string;
  phone: string;
  email: string;
  whatsapp: string;
  stage: string;
  recommendation_score: number;
  recommendation_reason: string;
};

const EMPTY_LEAD_DRAFT: LeadDraft = {
  merchant_name: "",
  company_name: "",
  contact_person: "",
  country: "",
  country_code: "",
  phone: "",
  email: "",
  whatsapp: "",
  stage: "new",
  recommendation_score: 0,
  recommendation_reason: "",
};

type ContactLogItem = {
  id: number;
  type: string;
  channel: string;
  content: string;
  created_at: string;
};

function getToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)ai_trade_token=([^;]*)/);
  return match?.[1] ?? null;
}

export function SupplierLeadsPage() {
  const { t } = useTranslation();
  const locale = i18n.language;

  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [ordering, setOrdering] = useState("-id");
  const [editingLead, setEditingLead] = useState<LeadItem | "create" | null>(null);
  const [leadDraft, setLeadDraft] = useState<LeadDraft>(EMPTY_LEAD_DRAFT);
  const [leadSaving, setLeadSaving] = useState(false);
  const [leadFormError, setLeadFormError] = useState("");

  /* ---- 联系记录抽屉 ---- */
  const [contactDrawerLead, setContactDrawerLead] = useState<LeadItem | null>(null);
  const [detailLead, setDetailLead] = useState<LeadItem | null>(null);
  const [contactLogs, setContactLogs] = useState<ContactLogItem[]>([]);
  const [contactLogsLoading, setContactLogsLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchLeads = useCallback(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }

    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (search) params.set("search", search);
    if (countryFilter) params.set("country", countryFilter);
    if (stageFilter) params.set("stage", stageFilter);
    params.set("ordering", ordering);

    fetch(`/api/supplier/leads/?${params.toString()}`, {
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
  }, [page, pageSize, search, countryFilter, stageFilter, ordering, t]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  function handleSearch() {
    setSearch(searchInput.trim());
    setPage(1);
  }

  function clearSearch() {
    setSearchInput("");
    setSearch("");
    setPage(1);
  }

  function goPage(p: number) { setPage(Math.max(1, Math.min(p, totalPages))); }

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

  /* ---- 联系记录 ---- */
  function openContactLogs(item: LeadItem) {
    setContactDrawerLead(item);
    setContactLogs([]);
    fetchContactLogs(item.id);
  }

  function closeContactLogs() {
    setContactDrawerLead(null);
    setContactLogs([]);
  }

  async function fetchContactLogs(leadId: string) {
    const token = getToken();
    if (!token) return;
    setContactLogsLoading(true);
    try {
      const res = await fetch(`/api/supplier/leads/${leadId}/contact-logs/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data?.code === 200 && data.data) {
        setContactLogs(data.data.results ?? []);
      }
    } catch { /* ignore */ } finally {
      setContactLogsLoading(false);
    }
  }

  const contactTypeLabel = (v: string) => {
    const opt = CONTACT_TYPE_OPTIONS.find((o) => o.value === v);
    return opt ? (locale === "zh-CN" ? opt.label : opt.labelEn) : v;
  };

  const contactChannelLabel = (v: string) => {
    const opt = CONTACT_CHANNEL_OPTIONS.find((o) => o.value === v);
    return opt ? (locale === "zh-CN" ? opt.label : opt.labelEn) : v;
  };

  const scoreTier = (score: number) => (score >= 80 ? "high" : score >= 50 ? "medium" : "low");
  const isZh = locale === "zh-CN";

  function openCreateLead() {
    setEditingLead("create");
    setLeadDraft(EMPTY_LEAD_DRAFT);
    setLeadFormError("");
  }

  function openEditLead(item: LeadItem) {
    setEditingLead(item);
    setLeadDraft({
      merchant_name: item.merchant_name,
      company_name: item.company_name,
      contact_person: item.contact_person,
      country: item.country,
      country_code: item.country_code,
      phone: item.phone,
      email: item.email,
      whatsapp: item.whatsapp,
      stage: item.stage,
      recommendation_score: item.recommendation_score,
      recommendation_reason: item.recommendation_reason,
    });
    setLeadFormError("");
  }

  async function saveLead() {
    const token = getToken();
    if (!token || !editingLead) return;
    if (!leadDraft.merchant_name.trim() || !leadDraft.company_name.trim() || !leadDraft.country) {
      setLeadFormError(isZh ? "商户名称、公司名称和国家为必填项。" : "Merchant, company and country are required.");
      return;
    }
    const creating = editingLead === "create";
    const url = creating ? "/api/supplier/leads/" : `/api/supplier/leads/${editingLead.id}/update/`;
    const body = creating
      ? { ...leadDraft, merchant_name: leadDraft.merchant_name.trim(), company_name: leadDraft.company_name.trim() }
      : leadDraft;
    setLeadSaving(true);
    setLeadFormError("");
    try {
      const response = await fetch(url, {
        method: creating ? "POST" : "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (data?.code !== 200) {
        setLeadFormError(data?.message ?? (isZh ? "线索保存失败。" : "Lead could not be saved."));
        return;
      }
      setEditingLead(null);
      fetchLeads();
    } catch {
      setLeadFormError(isZh ? "线索保存失败。" : "Lead could not be saved.");
    } finally {
      setLeadSaving(false);
    }
  }
  const detailTabOverview = isZh ? "核心信息" : "Overview";
  const detailTabContact = isZh ? "联系方式" : "Contact";
  const detailTabNotes = isZh ? "备注" : "Notes";
  const pageCopy = isZh
    ? {
        emptyTitle: "暂无匹配线索",
        emptyDescription: "当前筛选条件下没有线索记录。调整筛选条件后可继续查看线索列表和联系入口。",
        errorTitle: "线索列表暂不可用",
        errorDescription: "线索列表暂时无法加载，请稍后重试或调整筛选条件。",
      }
    : {
        emptyTitle: "No matching leads",
        emptyDescription: "No leads match the current filters. Adjust the filters to continue reviewing leads and contact entry points.",
        errorTitle: "Lead list unavailable",
        errorDescription: "The lead list could not be loaded. Try again later or adjust the filters.",
      };

  return (
    <div className={`${opsStyles.whiteCard} ${supplierStyles.supplierListCard}`}>
      <BackendDataSurface
        toolbar={(
          <div className={`${supplierStyles.supplierFilterToolbar} ${supplierStyles.supplierLeadFilterToolbar}`}>
            <label className={supplierStyles.supplierSearchBox}>
              <Search size={14} aria-hidden="true" />
              <Input
                type="text"
                className={supplierStyles.supplierSearchInput}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                placeholder={t("supplier.searchPlaceholder")}
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
            <BackendCombobox
              className={supplierStyles.supplierLeadCombobox}
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
            <BackendCombobox
              className={supplierStyles.supplierLeadCombobox}
              aria-label={t("supplier.allStages")}
              value={stageFilter}
              onChange={(value) => { setStageFilter(value); setPage(1); }}
              options={[
                { value: "", label: t("supplier.allStages") },
                ...STAGE_OPTIONS.map((s) => ({ value: s.value, label: locale === "zh-CN" ? s.label : s.labelEn })),
              ]}
              emptyLabel={t("ops.comboboxNoResults")}
              placeholder={t("supplier.allStages")}
              variant="filter"
            />
            <BackendSearchButton label={t("supplier.search")} onClick={handleSearch} />
            <BackendToolbarButton onClick={openCreateLead}>
              <Plus aria-hidden="true" />
              {isZh ? "新建线索" : "New lead"}
            </BackendToolbarButton>
          </div>
        )}
        footer={(
          <div className={`${opsStyles.pagination} ${opsStyles.leadsSurfacePagination}`}>
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
        )}
      >
        {loading ? (
          <SupplierTableSkeleton label={t("common.loading")} />
        ) : error ? (
          <SupplierErrorState
            title={pageCopy.errorTitle}
            description={pageCopy.errorDescription}
          />
        ) : leads.length === 0 ? (
          <SupplierEmptyState
            title={pageCopy.emptyTitle}
            description={pageCopy.emptyDescription}
          />
        ) : (
          <div className={`${opsStyles.tableWrapper} ${opsStyles.leadsSurfaceTableWrapper} ${supplierStyles.supplierDataTableWrapper}`}>
            <Table className={`${opsStyles.dataTable} ${opsStyles.actionColumnTable} ${opsStyles.compactActionColumn} ${opsStyles.leadsCompactTable} ${opsStyles.leadsMenuTable} ${opsStyles.opsAggregatedLeadsTable} ${supplierStyles.supplierLeadTable}`}>
              <TableHeader>
                <TableRow>
                  <TableHead className={opsStyles.leadsMerchantColumn}>{t("ops.leadsColMerchantInfo")}</TableHead>
                  <TableHead className={opsStyles.leadsCountryColumn}>{t("ops.leadsColCountry")}</TableHead>
                  <TableHead className={opsStyles.leadsContactColumn}>{t("ops.leadsColContactMethods")}</TableHead>
                  <TableHead className={opsStyles.leadsTimeColumn}>{t("ops.leadsColTimeline")}</TableHead>
                  <TableHead className={opsStyles.leadsStageColumn}>{t("ops.leadsColStage")}</TableHead>
                  <TableHead className={opsStyles.leadsScoreColumn}>{t("ops.leadsColScore")}</TableHead>
                  <TableHead className={opsStyles.leadsActionColumn}>{t("ops.leadsColDetails")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                  {leads.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className={opsStyles.leadInfoStack}>
                          <div className={opsStyles.leadInfoRow} aria-label={`${t("ops.leadsColMerchant")}: ${item.merchant_name || "—"}`}>
                            <Store aria-hidden="true" />
                            <span title={item.merchant_name || undefined}>{item.merchant_name || "—"}</span>
                          </div>
                          <div className={opsStyles.leadInfoRow} aria-label={`${t("ops.leadsColCompany")}: ${item.company_name || "—"}`}>
                            <Building2 aria-hidden="true" />
                            <span title={item.company_name || undefined}>{item.company_name || "—"}</span>
                          </div>
                          <div className={opsStyles.leadInfoRow} aria-label={`${t("ops.leadsColContact")}: ${item.contact_person || "—"}`}>
                            <UserRound aria-hidden="true" />
                            <span title={item.contact_person || undefined}>{item.contact_person || "—"}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={opsStyles.leadLocationCell}>
                          <span>{countryLabel(item.country) || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={opsStyles.leadInfoStack}>
                          <div className={opsStyles.leadInfoRow} aria-label={`${t("ops.leadsColEmail")}: ${item.email || "—"}`}>
                            <Mail aria-hidden="true" />
                            <span title={item.email || undefined}>{item.email || "—"}</span>
                          </div>
                          <div className={opsStyles.leadInfoRow} aria-label={`${t("ops.leadsColWhatsapp")}: ${item.whatsapp || "—"}`}>
                            <WhatsAppIcon className={opsStyles.whatsAppIcon} />
                            <span title={item.whatsapp || undefined}>{item.whatsapp || "—"}</span>
                          </div>
                          <div className={opsStyles.leadInfoRow} aria-label={`${t("ops.leadsColPhone")}: ${formatPhone(item.country_code, item.phone)}`}>
                            <Phone aria-hidden="true" />
                            <span title={formatPhone(item.country_code, item.phone)}>{formatPhone(item.country_code, item.phone)}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={opsStyles.leadInfoStack}>
                          <div className={opsStyles.leadInfoRow} aria-label={`${t("ops.leadsColLatestContact")}: ${formatDate(item.latest_contact_at)}`}>
                            <MessageSquareText aria-hidden="true" />
                            <span>{formatDate(item.latest_contact_at)}</span>
                          </div>
                          <div className={opsStyles.leadInfoRow} aria-label={`${t("ops.leadsColCreated")}: ${formatDate(item.created_at)}`}>
                            <CalendarPlus aria-hidden="true" />
                            <span>{formatDate(item.created_at)}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className={opsStyles.leadsStageCell}>
                        <BackendStatusBadge tone="neutral">
                          {stageLabel(item.stage)}
                        </BackendStatusBadge>
                      </TableCell>
                      <TableCell>
                        <span className={opsStyles.leadScoreCell}>
                          {item.recommendation_score}
                        </span>
                      </TableCell>
                      <TableCell>
                        <BackendRowActions
                          label={t("common.moreActions")}
                          items={[
                            { label: t("ops.leadsDetailTitle"), onSelect: () => setDetailLead(item) },
                            { label: isZh ? "编辑线索" : "Edit lead", onSelect: () => openEditLead(item) },
                            { label: t("supplier.viewContactLogsBtn"), onSelect: () => openContactLogs(item) },
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

      <Sheet open={editingLead !== null} onOpenChange={(open) => { if (!open) setEditingLead(null); }}>
        <SheetContent side="right" className={opsStyles.leadDetailSheet}>
          <SheetHeader>
            <SheetTitle>{editingLead === "create" ? (isZh ? "新建线索" : "New lead") : (isZh ? "编辑线索" : "Edit lead")}</SheetTitle>
            <SheetDescription>{isZh ? "填写客户公司、联系人和跟进信息。" : "Maintain company, contact and follow-up details."}</SheetDescription>
          </SheetHeader>
          <div className={opsStyles.drawerTabContent}>
            <div className={opsStyles.formGroup}>
              <label className={opsStyles.formLabel}>{isZh ? "商户名称" : "Merchant"}</label>
              <Input value={leadDraft.merchant_name} onChange={(event) => setLeadDraft((draft) => ({ ...draft, merchant_name: event.target.value }))} />
            </div>
            <div className={opsStyles.formGroup}>
              <label className={opsStyles.formLabel}>{isZh ? "公司名称" : "Company"}</label>
              <Input value={leadDraft.company_name} onChange={(event) => setLeadDraft((draft) => ({ ...draft, company_name: event.target.value }))} />
            </div>
            <div className={opsStyles.formGroup}>
              <label className={opsStyles.formLabel}>{isZh ? "联系人" : "Contact"}</label>
              <Input value={leadDraft.contact_person} onChange={(event) => setLeadDraft((draft) => ({ ...draft, contact_person: event.target.value }))} />
            </div>
            <div className={opsStyles.formGroup}>
              <label className={opsStyles.formLabel}>{isZh ? "国家" : "Country"}</label>
              <select className={opsStyles.formInput} value={leadDraft.country} onChange={(event) => setLeadDraft((draft) => ({ ...draft, country: event.target.value }))}>
                <option value="">{isZh ? "请选择" : "Select"}</option>
                {COUNTRY_OPTIONS.map((country) => <option key={country.value} value={country.value}>{isZh ? country.label : country.labelEn}</option>)}
              </select>
            </div>
            <div className={opsStyles.formGroup}>
              <label className={opsStyles.formLabel}>{isZh ? "阶段" : "Stage"}</label>
              <select className={opsStyles.formInput} value={leadDraft.stage} disabled={editingLead === "create"} onChange={(event) => setLeadDraft((draft) => ({ ...draft, stage: event.target.value }))}>
                {STAGE_OPTIONS.map((stage) => <option key={stage.value} value={stage.value}>{isZh ? stage.label : stage.labelEn}</option>)}
              </select>
            </div>
            <div className={opsStyles.formGroup}>
              <label className={opsStyles.formLabel}>{isZh ? "邮箱" : "Email"}</label>
              <Input type="email" value={leadDraft.email} onChange={(event) => setLeadDraft((draft) => ({ ...draft, email: event.target.value }))} />
            </div>
            <div className={opsStyles.formGroup}>
              <label className={opsStyles.formLabel}>{isZh ? "国家区号" : "Country code"}</label>
              <Input value={leadDraft.country_code} onChange={(event) => setLeadDraft((draft) => ({ ...draft, country_code: event.target.value }))} placeholder="+86" />
            </div>
            <div className={opsStyles.formGroup}>
              <label className={opsStyles.formLabel}>{isZh ? "电话" : "Phone"}</label>
              <Input value={leadDraft.phone} onChange={(event) => setLeadDraft((draft) => ({ ...draft, phone: event.target.value }))} />
            </div>
            <div className={opsStyles.formGroup}>
              <label className={opsStyles.formLabel}>WhatsApp</label>
              <Input value={leadDraft.whatsapp} onChange={(event) => setLeadDraft((draft) => ({ ...draft, whatsapp: event.target.value }))} />
            </div>
            <div className={opsStyles.formGroup}>
              <label className={opsStyles.formLabel}>{isZh ? "推荐评分" : "Score"}</label>
              <Input type="number" min={0} max={100} value={leadDraft.recommendation_score} onChange={(event) => setLeadDraft((draft) => ({ ...draft, recommendation_score: Math.max(0, Math.min(100, Number(event.target.value) || 0)) }))} />
            </div>
            <div className={opsStyles.formGroup}>
              <label className={opsStyles.formLabel}>{isZh ? "推荐理由" : "Recommendation reason"}</label>
              <Textarea value={leadDraft.recommendation_reason} onChange={(event) => setLeadDraft((draft) => ({ ...draft, recommendation_reason: event.target.value }))} />
            </div>
            {leadFormError ? <p className={opsStyles.formError}>{leadFormError}</p> : null}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setEditingLead(null)} disabled={leadSaving}>{t("common.cancel")}</Button>
            <Button onClick={() => void saveLead()} disabled={leadSaving}>
              {leadSaving ? <Loader2 className={opsStyles.spinIcon} aria-hidden="true" /> : null}
              {isZh ? "保存" : "Save"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={!!detailLead} onOpenChange={(open) => { if (!open) setDetailLead(null); }}>
        <SheetContent side="right" className={opsStyles.leadDetailSheet}>
          <SheetHeader className={opsStyles.leadDetailHeader}>
            <SheetTitle>{t("ops.leadsDetailTitle")}</SheetTitle>
            <SheetDescription>
              {detailLead?.company_name || detailLead?.merchant_name || "—"} (#{detailLead?.id})
            </SheetDescription>
          </SheetHeader>

          {detailLead ? (
            <div className={opsStyles.leadDetailHero}>
              <div className={opsStyles.leadDetailIdentity}>
                <span className={opsStyles.leadDetailStage} data-stage={detailLead.stage}>
                  {stageLabel(detailLead.stage)}
                </span>
                <h3>{detailLead.merchant_name || detailLead.company_name || `#${detailLead.id}`}</h3>
                <p>{detailLead.company_name || "—"}</p>
              </div>
              <div className={opsStyles.leadDetailScoreCard} data-score-tier={scoreTier(detailLead.recommendation_score)}>
                <span>{t("supplier.colScore")}</span>
                <strong>{detailLead.recommendation_score}</strong>
              </div>
            </div>
          ) : null}

          <Tabs defaultValue="overview" className={opsStyles.detailTabs}>
            <TabsList className={opsStyles.detailTabsList}>
              <TabsTrigger value="overview">{detailTabOverview}</TabsTrigger>
              <TabsTrigger value="contact">{detailTabContact}</TabsTrigger>
              <TabsTrigger value="notes">{detailTabNotes}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className={opsStyles.detailTabPanel}>
              <div className={opsStyles.detailInfoGrid}>
                <div className={opsStyles.detailInfoItem}>
                  <span>{t("supplier.colFollowStage")}</span>
                  <strong>{stageLabel(detailLead?.stage ?? "")}</strong>
                </div>
                <div className={opsStyles.detailInfoItem}>
                  <span>{t("supplier.colScore")}</span>
                  <strong>{detailLead?.recommendation_score ?? 0}</strong>
                </div>
                <div className={opsStyles.detailInfoItem}>
                  <span>{t("supplier.colMerchant")}</span>
                  <strong>{detailLead?.merchant_name || "—"}</strong>
                </div>
                <div className={opsStyles.detailInfoItem}>
                  <span>{t("supplier.colCompany")}</span>
                  <strong>{detailLead?.company_name || "—"}</strong>
                </div>
                <div className={opsStyles.detailInfoItem}>
                  <span>{t("supplier.colCountry")}</span>
                  <strong>{countryLabel(detailLead?.country ?? "")}</strong>
                </div>
                <div className={opsStyles.detailInfoItem}>
                  <span>{t("supplier.colUpdated")}</span>
                  <strong>{formatDatetime(detailLead?.updated_at ?? null)}</strong>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="contact" className={opsStyles.detailTabPanel}>
              <div className={opsStyles.detailInfoGrid}>
                <div className={opsStyles.detailInfoItem}>
                  <span>{t("supplier.colContact")}</span>
                  <strong>{detailLead?.contact_person || "—"}</strong>
                </div>
                <div className={opsStyles.detailInfoItem}>
                  <span>{t("supplier.colPhone")}</span>
                  <strong>{detailLead?.phone || "—"}</strong>
                </div>
                <div className={opsStyles.detailInfoItem}>
                  <span>{t("supplier.colCountryCode")}</span>
                  <strong>{detailLead?.country_code || "—"}</strong>
                </div>
                <div className={opsStyles.detailInfoItem}>
                  <span>{t("supplier.colEmail")}</span>
                  <strong>{detailLead?.email || "—"}</strong>
                </div>
                <div className={opsStyles.detailInfoItem}>
                  <span>{t("supplier.colWhatsapp")}</span>
                  <strong>{detailLead?.whatsapp || "—"}</strong>
                </div>
                <div className={opsStyles.detailInfoItem}>
                  <span>{t("supplier.colCreated")}</span>
                  <strong>{formatDatetime(detailLead?.created_at ?? null)}</strong>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="notes" className={opsStyles.detailTabPanel}>
              <div className={opsStyles.detailTextBlock}>
                <span>{t("supplier.colReason")}</span>
                <p>{detailLead?.recommendation_reason || "—"}</p>
              </div>
            </TabsContent>
          </Tabs>

          <SheetFooter className={opsStyles.leadDetailFooter}>
            <Button variant="outline" onClick={() => setDetailLead(null)}>{t("common.close")}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* 联系记录抽屉 */}
      <Drawer
        open={!!contactDrawerLead}
        onClose={closeContactLogs}
        title={contactDrawerLead ? t("supplier.contactLogDrawerTitle", { name: contactDrawerLead.merchant_name }) : t("supplier.contactLogs")}
      >
        {contactLogsLoading ? (
          <div className={opsStyles.loadingText}><Loader2 size={18} className={opsStyles.spinIcon} />{t("supplier.loading")}</div>
        ) : contactLogs.length === 0 ? (
          <p className={opsStyles.emptyText}>{t("supplier.noContactLogs")}</p>
        ) : (
          <div className={opsStyles.timeline}>
            {contactLogs.map((log) => (
              <div key={log.id} className={opsStyles.timelineItem}>
                <div className={opsStyles.timelineDot} data-type={log.type} />
                <div className={opsStyles.timelineTime}>{formatDatetime(log.created_at)}</div>
                <div className={opsStyles.timelineMeta}>
                  <span className={opsStyles.timelineType} data-type={log.type}>{contactTypeLabel(log.type)}</span>
                  <span className={opsStyles.timelineChannel}>{contactChannelLabel(log.channel)}</span>
                </div>
                <div className={opsStyles.timelineContent}>{log.content}</div>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}
