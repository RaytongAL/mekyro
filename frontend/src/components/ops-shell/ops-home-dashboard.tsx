import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  ChevronRight,
  ClipboardList,
  FolderTree,
  Key,
  MessageSquare,
  Package,
  RefreshCw,
  ShoppingBag,
  Store,
  UserRound,
  UsersRound,
} from "lucide-react";
import i18n from "@/i18n";
import { api, type ApiResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import styles from "./ops-shell.module.css";

type DashboardPageId =
  | "supplier-management"
  | "api-keys"
  | "leads"
  | "contact-logs"
  | "supplier-inquiries"
  | "buyer-inquiries"
  | "products"
  | "inventory-logs";

type OpsHomeDashboardProps = {
  onNavigate: (page: DashboardPageId) => void;
};

type ListState<T> = {
  total: number;
  items: T[];
};

type LeadItem = {
  id?: number;
  merchant_name?: string;
  company_name?: string;
  country?: string;
  stage?: string;
  recommendation_score?: number;
  created_at?: string;
};

type ContactLogItem = {
  id?: number;
  ws_lead_id?: number;
  type?: string;
  channel?: string;
  content?: string;
  created_at?: string;
};

type InquiryItem = {
  id?: number;
  company_name?: string;
  country?: string;
  status?: string;
  created_at?: string;
};

type ProductItem = {
  id?: number;
  product_name?: string;
  sku_code?: string;
  stock_quantity?: number;
  status?: string;
  created_at?: string;
};

type ApiKeyItem = {
  is_active?: boolean;
  created_at?: string;
};

type ActivityItem = {
  created_at?: string;
};

type DashboardFallback = {
  stats: DashboardStats;
  inquiries: (InquiryItem & { kind: "supplier" | "buyer" })[];
  contactLogs: ContactLogItem[];
  products: ProductItem[];
};

/** 新 stats 接口返回的数据结构 */
type DashboardStats = {
  workspace_count: number;
  lead_count: number;
  high_score_lead_count: number;
  lead_stages: Record<string, number>;
  contact_log_count: number;
  log_types: Record<string, number>;
  supplier_inquiry_count: number;
  buyer_inquiry_count: number;
  pending_inquiry_count: number;
  inquiry_statuses: Record<string, number>;
  product_count: number;
  out_of_stock_count: number;
  category_count: number;
  inventory_log_count: number;
  active_api_key_count: number;
  latest_activity_time: string | null;
  recent_leads: LeadItem[];
};

const leadStageKeys = [
  "new",
  "contacting",
  "replied",
  "qualified",
  "quoting",
  "ordered",
  "lost",
] as const;

const inquiryStatusKeys = ["pending", "processing", "completed", "rejected"] as const;

const logTypeKeys = ["ai_outbound", "human_outbound", "customer_inbound"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compactText(value: unknown, fallback = "-"): string {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function formatDate(value: string | undefined, locale: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function sortByCreatedAt<T extends { created_at?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
}

function countBy<T>(items: T[], getKey: (item: T) => string | undefined): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = getKey(item);
    if (key) counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function latestActivityTime(groups: Array<Array<{ created_at?: string }>>): string | null {
  let latest: string | null = null;
  let latestTime = 0;
  groups.forEach((items) => {
    items.forEach((item) => {
      const time = new Date(item.created_at ?? "").getTime();
      if (Number.isFinite(time) && time > latestTime) {
        latestTime = time;
        latest = item.created_at ?? null;
      }
    });
  });
  return latest;
}

async function loadList<T>(url: string, listKey: "results" | "keys" = "results"): Promise<ListState<T>> {
  const response = await api<ApiResponse<unknown>>(url);
  if (response?.code !== 200) {
    throw new Error(response?.message || "Failed to load");
  }

  const data = response.data;
  if (Array.isArray(data)) {
    return { total: data.length, items: data as T[] };
  }

  if (!isRecord(data)) {
    return { total: 0, items: [] };
  }

  const rawItems = data[listKey];
  const items = Array.isArray(rawItems) ? (rawItems as T[]) : [];
  return {
    total: toNumber(data.total) || items.length,
    items,
  };
}

async function safeLoadList<T>(url: string, listKey: "results" | "keys" = "results"): Promise<ListState<T>> {
  try {
    return await loadList<T>(url, listKey);
  } catch {
    return { total: 0, items: [] };
  }
}

function resolveList<T>(result: PromiseSettledResult<ListState<T>>): ListState<T> {
  if (result.status === "fulfilled") return result.value;
  return { total: 0, items: [] };
}

async function loadDashboardFallback(): Promise<DashboardFallback> {
  const [
    workspaces,
    leads,
    contactLogs,
    supplierInquiries,
    buyerInquiries,
    products,
    categories,
    inventoryLogs,
    apiKeys,
  ] = await Promise.all([
    safeLoadList<unknown>("/api/workspace/list/?page=1&page_size=100"),
    safeLoadList<LeadItem>("/api/internal/leads/?page=1&page_size=100&ordering=-id"),
    safeLoadList<ContactLogItem>("/api/internal/contact-logs/?page=1&page_size=100&ordering=-id"),
    safeLoadList<InquiryItem>("/api/internal/inquiries/suppliers/?page=1&page_size=50&ordering=-id"),
    safeLoadList<InquiryItem>("/api/internal/inquiries/buyers/?page=1&page_size=50&ordering=-id"),
    safeLoadList<ProductItem>("/api/internal/products/?page=1&page_size=50&flat=true"),
    safeLoadList<unknown>("/api/internal/categories/?page=1&page_size=100"),
    safeLoadList<ActivityItem>("/api/internal/inventory-logs/?page=1&page_size=50&ordering=-id"),
    safeLoadList<ApiKeyItem>("/api/internal/api-keys/?page=1&page_size=100", "keys"),
  ]);

  const inquiries = sortByCreatedAt([
    ...supplierInquiries.items.map((item) => ({ ...item, kind: "supplier" as const })),
    ...buyerInquiries.items.map((item) => ({ ...item, kind: "buyer" as const })),
  ]);
  const sortedLeads = sortByCreatedAt(leads.items);
  const sortedContactLogs = sortByCreatedAt(contactLogs.items);
  const sortedProducts = sortByCreatedAt(products.items);

  return {
    stats: {
      workspace_count: workspaces.total,
      lead_count: leads.total,
      high_score_lead_count: leads.items.filter((item) => toNumber(item.recommendation_score) >= 80).length,
      lead_stages: countBy(leads.items, (item) => item.stage || "new"),
      contact_log_count: contactLogs.total,
      log_types: countBy(contactLogs.items, (item) => item.type || "ai_outbound"),
      supplier_inquiry_count: supplierInquiries.total,
      buyer_inquiry_count: buyerInquiries.total,
      pending_inquiry_count: inquiries.filter((item) => (item.status || "pending") === "pending").length,
      inquiry_statuses: countBy(inquiries, (item) => item.status || "pending"),
      product_count: products.total,
      out_of_stock_count: products.items.filter((item) => toNumber(item.stock_quantity) <= 0).length,
      category_count: categories.total || categories.items.length,
      inventory_log_count: inventoryLogs.total,
      active_api_key_count: apiKeys.items.filter((item) => item.is_active).length,
      latest_activity_time: latestActivityTime([
        sortedLeads,
        inquiries,
        sortedContactLogs,
        sortedProducts,
        inventoryLogs.items,
        apiKeys.items,
      ]),
      recent_leads: sortedLeads.slice(0, 5),
    },
    inquiries: inquiries.slice(0, 5),
    contactLogs: sortedContactLogs.slice(0, 5),
    products: sortedProducts.slice(0, 5),
  };
}

export function OpsHomeDashboard({ onNavigate }: OpsHomeDashboardProps) {
  const { t } = useTranslation();
  const locale = i18n.language;

  /** 统计数据（首屏即加载） */
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  /** Tab 按需加载状态 */
  const [inquiries, setInquiries] = useState<(InquiryItem & { kind: "supplier" | "buyer" })[]>([]);
  const [inquiriesLoading, setInquiriesLoading] = useState(false);
  const [contactLogs, setContactLogs] = useState<ContactLogItem[]>([]);
  const [contactLogsLoading, setContactLogsLoading] = useState(false);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  /** 加载统计数据（替代原来的 9 个并行请求） */
  const loadDashboard = useCallback(() => {
    let active = true;
    setLoading(true);

    async function load() {
      try {
        const response = await api<ApiResponse<DashboardStats>>("/api/internal/dashboard/stats/");
        if (!active) return;
        if (response?.code === 200 && response.data && (response.data.recent_leads?.length ?? 0) > 0) {
          setStats(response.data);
        } else {
          const fallback = await loadDashboardFallback();
          if (!active) return;
          setStats(fallback.stats);
          setInquiries(fallback.inquiries);
          setContactLogs(fallback.contactLogs);
          setProducts(fallback.products);
        }
      } catch {
        const fallback = await loadDashboardFallback();
        if (!active) return;
        setStats(fallback.stats);
        setInquiries(fallback.inquiries);
        setContactLogs(fallback.contactLogs);
        setProducts(fallback.products);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => loadDashboard(), [loadDashboard]);

  /** 按需加载询盘 Tab 数据 */
  const loadInquiries = useCallback(async () => {
    if (inquiries.length > 0 || inquiriesLoading) return;
    setInquiriesLoading(true);
    const [supplier, buyer] = await Promise.allSettled([
      loadList<InquiryItem>("/api/internal/inquiries/suppliers/?page=1&page_size=5&ordering=-id"),
      loadList<InquiryItem>("/api/internal/inquiries/buyers/?page=1&page_size=5&ordering=-id"),
    ]);
    setInquiries(
      sortByCreatedAt([
        ...resolveList(supplier).items.map((item) => ({ ...item, kind: "supplier" as const })),
        ...resolveList(buyer).items.map((item) => ({ ...item, kind: "buyer" as const })),
      ]),
    );
    setInquiriesLoading(false);
  }, [inquiries.length, inquiriesLoading]);

  /** 按需加载联系记录 Tab 数据 */
  const loadContactLogs = useCallback(async () => {
    if (contactLogs.length > 0 || contactLogsLoading) return;
    setContactLogsLoading(true);
    try {
      const result = await loadList<ContactLogItem>(
        "/api/internal/contact-logs/?page=1&page_size=5&ordering=-id",
      );
      setContactLogs(sortByCreatedAt(result.items));
    } catch {
      /* ignore */
    }
    setContactLogsLoading(false);
  }, [contactLogs.length, contactLogsLoading]);

  /** 按需加载商品 Tab 数据 */
  const loadProducts = useCallback(async () => {
    if (products.length > 0 || productsLoading) return;
    setProductsLoading(true);
    try {
      const result = await loadList<ProductItem>(
        "/api/internal/products/?page=1&page_size=5&flat=true",
      );
      setProducts(sortByCreatedAt(result.items));
    } catch {
      /* ignore */
    }
    setProductsLoading(false);
  }, [products.length, productsLoading]);

  /** Tab 切换时触发按需加载 */
  const handleTabChange = useCallback(
    (value: string) => {
      if (value === "inquiries") loadInquiries();
      else if (value === "contacts") loadContactLogs();
      else if (value === "products") loadProducts();
    },
    [loadInquiries, loadContactLogs, loadProducts],
  );

  // ==================== 从 stats 计算首屏数据 ====================

  const inquiryTotal = (stats?.supplier_inquiry_count ?? 0) + (stats?.buyer_inquiry_count ?? 0);
  const latestActivityTime = stats?.latest_activity_time
    ? formatDate(stats.latest_activity_time, locale)
    : "-";

  const metricCards = [
    {
      icon: UsersRound,
      label: t("ops.dashboardMetricSuppliers"),
      value: stats?.workspace_count ?? 0,
      detail: t("ops.dashboardMetricSuppliersHint"),
      target: "supplier-management" as const,
    },
    {
      icon: UserRound,
      label: t("ops.dashboardMetricLeads"),
      value: stats?.lead_count ?? 0,
      detail: t("ops.dashboardHighScoreLeads", { count: stats?.high_score_lead_count ?? 0 }),
      target: "leads" as const,
    },
    {
      icon: MessageSquare,
      label: t("ops.dashboardMetricContactLogs"),
      value: stats?.contact_log_count ?? 0,
      detail: t("ops.dashboardLatestActivity", { time: latestActivityTime }),
      target: "contact-logs" as const,
    },
    {
      icon: Store,
      label: t("ops.dashboardMetricInquiries"),
      value: inquiryTotal,
      detail: t("ops.dashboardPendingInquiries", { count: stats?.pending_inquiry_count ?? 0 }),
      target: "supplier-inquiries" as const,
    },
    {
      icon: Package,
      label: t("ops.dashboardMetricProducts"),
      value: stats?.product_count ?? 0,
      detail: t("ops.dashboardOutOfStock", { count: stats?.out_of_stock_count ?? 0 }),
      target: "products" as const,
    },
    {
      icon: FolderTree,
      label: t("ops.dashboardMetricCategories"),
      value: stats?.category_count ?? 0,
      detail: t("ops.dashboardMetricCategoriesHint"),
      target: "products" as const,
    },
    {
      icon: ClipboardList,
      label: t("ops.dashboardMetricInventoryLogs"),
      value: stats?.inventory_log_count ?? 0,
      detail: t("ops.dashboardLatestActivity", { time: latestActivityTime }),
      target: "inventory-logs" as const,
    },
    {
      icon: Key,
      label: t("ops.dashboardMetricApiKeys"),
      value: stats?.active_api_key_count ?? 0,
      detail: t("ops.dashboardActiveApiKeys", { count: stats?.active_api_key_count ?? 0 }),
      target: "api-keys" as const,
    },
  ];

  const primaryMetrics = metricCards.filter((_, index) => [0, 1, 2, 4].includes(index));

  const dailySummaryItems = [
    {
      label: t("ops.dashboardPendingInquiriesLabel"),
      value: stats?.pending_inquiry_count ?? 0,
      target: "supplier-inquiries" as const,
    },
    {
      label: t("ops.dashboardHighScoreLeadsLabel"),
      value: stats?.high_score_lead_count ?? 0,
      target: "leads" as const,
    },
    {
      label: t("ops.dashboardOutOfStockLabel"),
      value: stats?.out_of_stock_count ?? 0,
      target: "products" as const,
    },
    {
      label: t("ops.dashboardMetricApiKeys"),
      value: stats?.active_api_key_count ?? 0,
      target: "api-keys" as const,
    },
  ];

  // ==================== 渲染函数 ====================

  function renderPrimaryMetrics() {
    if (loading) {
      return Array.from({ length: 4 }, (_, index) => (
        <Card key={index} className={styles.dashboardMetric} size="sm">
          <CardHeader className={styles.dashboardMetricHeader}>
            <Skeleton className={styles.dashboardMetricIconSkeleton} />
            <Skeleton className={styles.dashboardMetricTextSkeleton} />
          </CardHeader>
          <CardContent className={styles.dashboardMetricContent}>
            <Skeleton className={styles.dashboardMetricValueSkeleton} />
            <Skeleton className={styles.dashboardMetricDetailSkeleton} />
          </CardContent>
        </Card>
      ));
    }

    return primaryMetrics.map((metric) => {
      const Icon = metric.icon;
      return (
        <Card key={metric.label} className={styles.dashboardMetric} size="sm">
          <CardHeader className={styles.dashboardMetricHeader}>
            <span className={styles.dashboardMetricIcon}>
              <Icon aria-hidden="true" />
            </span>
            <CardTitle className={styles.dashboardMetricTitle}>{metric.label}</CardTitle>
          </CardHeader>
          <CardContent className={styles.dashboardMetricContent}>
            <strong>{metric.value.toLocaleString(locale)}</strong>
            <span>{metric.detail}</span>
          </CardContent>
        </Card>
      );
    });
  }

  function renderBarRows(
    keys: readonly string[],
    counts: Record<string, number>,
    labelPrefix: string,
    total: number,
  ) {
    if (loading) {
      return Array.from({ length: 4 }, (_, index) => (
        <div className={styles.dashboardBarRow} key={index}>
          <Skeleton className={styles.dashboardBarLabelSkeleton} />
          <Skeleton className={styles.dashboardBarTrackSkeleton} />
        </div>
      ));
    }

    if (total === 0) {
      return (
        <Empty className={styles.dashboardEmpty}>
          <EmptyMedia variant="icon">
            <BarChart3 aria-hidden="true" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{t("ops.dashboardNoDistribution")}</EmptyTitle>
            <EmptyDescription>{t("ops.dashboardNoDistributionDesc")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return keys.map((key) => {
      const count = counts[key] ?? 0;
      const percent = total > 0 ? Math.round((count / total) * 100) : 0;
      return (
        <div className={styles.dashboardBarRow} key={key}>
          <div className={styles.dashboardBarMeta}>
            <span>{t(`${labelPrefix}.${key}`)}</span>
            <strong>{count}</strong>
          </div>
          <div className={styles.dashboardBarTrack} aria-hidden="true">
            <span
              className={styles.dashboardBarFill}
              style={{ width: count > 0 ? `${Math.max(percent, 6)}%` : "0%" }}
            />
          </div>
        </div>
      );
    });
  }

  function renderRecentEmpty() {
    return (
      <Empty className={styles.dashboardEmpty}>
        <EmptyMedia variant="icon">
          <ClipboardList aria-hidden="true" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>{t("ops.dashboardNoRecentData")}</EmptyTitle>
          <EmptyDescription>{t("ops.dashboardNoRecentDataDesc")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  function renderRecentLoading() {
    return (
      <div className={styles.dashboardRecentLoading}>
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className={styles.dashboardRecentSkeleton} />
        ))}
      </div>
    );
  }

  // 默认 Tab（leads）数据来自 stats，其余 Tab 按需加载
  const recentLeads = stats?.recent_leads ?? [];
  const recentInquiries = inquiries.slice(0, 5);
  const recentContactLogs = contactLogs.slice(0, 5);
  const recentProducts = products.slice(0, 5);

  return (
    <div className={styles.dashboard}>
      <div className={styles.dashboardRefreshMeta}>
        <span>{t("ops.dashboardSignalDesc", { time: latestActivityTime })}</span>
          <Button
            aria-label={t("ops.dashboardRefresh")}
            className={styles.dashboardRefreshIconButton}
            size="icon-sm"
            title={t("ops.dashboardRefresh")}
            type="button"
            variant="ghost"
            onClick={loadDashboard}
          >
            <RefreshCw aria-hidden="true" />
          </Button>
      </div>

      <section className={styles.dashboardPrimaryMetrics} aria-label={t("ops.dashboardMetricSection")}>
        {renderPrimaryMetrics()}
      </section>

      <Card className={styles.dashboardBrief}>
        <CardHeader className={styles.dashboardSectionHeader}>
          <div>
            <CardTitle>{t("ops.dashboardBriefTitle")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className={styles.dashboardBriefList}>
          {loading
            ? Array.from({ length: 4 }, (_, index) => (
                <Skeleton className={styles.dashboardBriefItemSkeleton} key={index} />
              ))
            : dailySummaryItems.map((item) => (
                <button
                  aria-label={t("ops.dashboardOpenModule", { name: item.label })}
                  key={item.label}
                  type="button"
                  onClick={() => onNavigate(item.target)}
                >
                  <span>{item.label}</span>
                  <strong>{item.value.toLocaleString(locale)}</strong>
                  <ChevronRight aria-hidden="true" />
                </button>
              ))}
        </CardContent>
      </Card>

      <section className={styles.dashboardGrid}>
        <Card className={styles.dashboardSection}>
          <CardHeader className={styles.dashboardSectionHeader}>
            <div>
              <CardTitle>{t("ops.dashboardDistributionTitle")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className={styles.dashboardDistributionContent}>
            <div className={styles.dashboardDistributionGroup}>
              <div className={styles.dashboardMiniTitle}>
                <UserRound aria-hidden="true" />
                <span>{t("ops.dashboardLeadStageTitle")}</span>
              </div>
              {renderBarRows(leadStageKeys, stats?.lead_stages ?? {}, "ops.dashboardLeadStages", stats?.lead_count ?? 0)}
            </div>

            <div className={styles.dashboardDistributionGroup}>
              <div className={styles.dashboardMiniTitle}>
                <ShoppingBag aria-hidden="true" />
                <span>{t("ops.dashboardInquiryStatusTitle")}</span>
              </div>
              {renderBarRows(inquiryStatusKeys, stats?.inquiry_statuses ?? {}, "ops.dashboardInquiryStatuses", inquiryTotal)}
            </div>
          </CardContent>
        </Card>

        <Card className={styles.dashboardSection}>
          <CardHeader className={styles.dashboardSectionHeader}>
            <div>
              <CardTitle>{t("ops.dashboardSignalTitle")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className={styles.dashboardSignalContent}>
            <div className={styles.dashboardLogTypes}>
              {logTypeKeys.map((key) => (
                <div key={key}>
                  <span>{t(`ops.dashboardLogTypes.${key}`)}</span>
                  <strong>{(stats?.log_types ?? {})[key] ?? 0}</strong>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className={styles.dashboardRecentCard}>
        <CardHeader className={styles.dashboardSectionHeader}>
          <div>
            <CardTitle>{t("ops.dashboardRecentTitle")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className={styles.dashboardRecentContent}>
          <Tabs defaultValue="leads" className={styles.dashboardTabs} onValueChange={handleTabChange}>
            <TabsList className={styles.dashboardTabsList}>
              <TabsTrigger value="leads">{t("ops.dashboardRecentLeads")}</TabsTrigger>
              <TabsTrigger value="inquiries">{t("ops.dashboardRecentInquiries")}</TabsTrigger>
              <TabsTrigger value="contacts">{t("ops.dashboardRecentContactLogs")}</TabsTrigger>
              <TabsTrigger value="products">{t("ops.dashboardRecentProducts")}</TabsTrigger>
            </TabsList>

            {/* ---- leads（默认 Tab，来自 stats） ---- */}
            <TabsContent value="leads">
              {loading ? renderRecentLoading() : recentLeads.length === 0 ? renderRecentEmpty() : (
                <Table className={`${styles.dashboardTable} ${styles.dashboardLeadsTable}`}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("ops.leadsColCompany")}</TableHead>
                      <TableHead>{t("ops.leadsColMerchant")}</TableHead>
                      <TableHead>{t("ops.leadsColStage")}</TableHead>
                      <TableHead>{t("ops.leadsColScore")}</TableHead>
                      <TableHead>{t("ops.leadsColCreated")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentLeads.map((item) => (
                      <TableRow key={item.id ?? `${item.company_name}-${item.created_at}`}>
                        <TableCell>{compactText(item.company_name)}</TableCell>
                        <TableCell>{compactText(item.merchant_name)}</TableCell>
                        <TableCell>
                          <span className={styles.stageBadge} data-stage={item.stage}>
                            {t(`ops.dashboardLeadStages.${item.stage || "new"}`)}
                          </span>
                        </TableCell>
                        <TableCell>{toNumber(item.recommendation_score)}</TableCell>
                        <TableCell>{formatDate(item.created_at, locale)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* ---- inquiries（按需加载） ---- */}
            <TabsContent value="inquiries">
              {inquiriesLoading ? renderRecentLoading() : recentInquiries.length === 0 ? renderRecentEmpty() : (
                <Table className={`${styles.dashboardTable} ${styles.dashboardInquiriesTable}`}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("ops.inquiryColCompany")}</TableHead>
                      <TableHead>{t("ops.dashboardInquiryKind")}</TableHead>
                      <TableHead>{t("ops.inquiryColStatus")}</TableHead>
                      <TableHead>{t("ops.inquiryColCountry")}</TableHead>
                      <TableHead>{t("ops.inquiryColCreated")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentInquiries.map((item) => (
                      <TableRow key={`${item.kind}-${item.id ?? item.company_name}`}>
                        <TableCell>{compactText(item.company_name)}</TableCell>
                        <TableCell>
                          {item.kind === "supplier" ? t("ops.dashboardSupplierInquiry") : t("ops.dashboardBuyerInquiry")}
                        </TableCell>
                        <TableCell>
                          <span className={styles.stageBadge} data-stage={item.status}>
                            {t(`ops.dashboardInquiryStatuses.${item.status || "pending"}`)}
                          </span>
                        </TableCell>
                        <TableCell>{compactText(item.country)}</TableCell>
                        <TableCell>{formatDate(item.created_at, locale)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* ---- contacts（按需加载） ---- */}
            <TabsContent value="contacts">
              {contactLogsLoading ? renderRecentLoading() : recentContactLogs.length === 0 ? renderRecentEmpty() : (
                <Table className={`${styles.dashboardTable} ${styles.dashboardContactsTable}`}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("ops.contactLogsColLead")}</TableHead>
                      <TableHead>{t("ops.contactLogsColType")}</TableHead>
                      <TableHead>{t("ops.contactLogsColChannel")}</TableHead>
                      <TableHead>{t("ops.contactLogsColContent")}</TableHead>
                      <TableHead>{t("ops.contactLogsColCreated")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentContactLogs.map((item) => (
                      <TableRow key={item.id ?? `${item.ws_lead_id}-${item.created_at}`}>
                        <TableCell>#{compactText(item.ws_lead_id)}</TableCell>
                        <TableCell>
                          <span className={styles.logTypeBadge} data-type={item.type}>
                            {t(`ops.dashboardLogTypes.${item.type || "ai_outbound"}`)}
                          </span>
                        </TableCell>
                        <TableCell>{compactText(item.channel)}</TableCell>
                        <TableCell className={styles.dashboardTableContent}>{compactText(item.content)}</TableCell>
                        <TableCell>{formatDate(item.created_at, locale)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* ---- products（按需加载） ---- */}
            <TabsContent value="products">
              {productsLoading ? renderRecentLoading() : recentProducts.length === 0 ? renderRecentEmpty() : (
                <Table className={`${styles.dashboardTable} ${styles.dashboardProductsTable}`}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("ops.productsSkuColProduct")}</TableHead>
                      <TableHead>{t("ops.productsSkuColCode")}</TableHead>
                      <TableHead>{t("ops.productsSkuColStock")}</TableHead>
                      <TableHead>{t("ops.productsSkuColStatus")}</TableHead>
                      <TableHead>{t("ops.productsDetailCreated")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentProducts.map((item) => (
                      <TableRow key={item.id ?? `${item.product_name}-${item.sku_code}`}>
                        <TableCell>{compactText(item.product_name)}</TableCell>
                        <TableCell>{compactText(item.sku_code)}</TableCell>
                        <TableCell>{toNumber(item.stock_quantity).toLocaleString(locale)}</TableCell>
                        <TableCell>
                          {item.status === "active" ? t("ops.productsStatusActive") : t("ops.productsStatusInactive")}
                        </TableCell>
                        <TableCell>{formatDate(item.created_at, locale)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
