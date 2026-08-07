import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import {
  ArrowRight,
  BadgeCheck,
  Globe2,
  LineChart,
  Mail,
  MessageCircle,
  Phone,
  Target,
  TrendingUp,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { BackendStatusBadge } from "@/components/backend-ui/backend-status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle as UiCardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import styles from "./supplier-shell.module.css";

type OverviewStats = {
  leads: {
    total: number;
    new: number;
    contacting: number;
    qualified: number;
    converted: number;
    high_score: number;
    with_phone: number;
    with_email: number;
    with_whatsapp: number;
    score_high: number;
    score_mid: number;
    score_low: number;
    contact_log_total: number;
    countries: Array<{ country: string; count: number }>;
    recent: Array<{ id: number; merchant_name: string; company_name: string; country: string; stage: string; score: number }>;
  };
  orders: {
    total: number;
    total_amount: string;
  };
};

const COUNTRY_NAMES: Record<string, { zh: string; en: string }> = {
  CN: { zh: "中国", en: "China" },
  US: { zh: "美国", en: "United States" },
  UK: { zh: "英国", en: "United Kingdom" },
  FR: { zh: "法国", en: "France" },
  DE: { zh: "德国", en: "Germany" },
  ES: { zh: "西班牙", en: "Spain" },
  JP: { zh: "日本", en: "Japan" },
  KR: { zh: "韩国", en: "South Korea" },
  CA: { zh: "加拿大", en: "Canada" },
  AU: { zh: "澳大利亚", en: "Australia" },
  IT: { zh: "意大利", en: "Italy" },
  BR: { zh: "巴西", en: "Brazil" },
  IN: { zh: "印度", en: "India" },
  MX: { zh: "墨西哥", en: "Mexico" },
  NL: { zh: "荷兰", en: "Netherlands" },
  SE: { zh: "瑞典", en: "Sweden" },
  SG: { zh: "新加坡", en: "Singapore" },
  AE: { zh: "阿联酋", en: "UAE" },
  SA: { zh: "沙特阿拉伯", en: "Saudi Arabia" },
};

function getToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)ai_trade_token=([^;]*)/);
  return match?.[1] ?? null;
}

type SupplierOverviewPageProps = {
  onNavigate: (page: string) => void;
};

function formatCurrency(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `¥${value}`;

  return `¥${new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: numeric % 1 === 0 ? 0 : 2,
  }).format(numeric)}`;
}

function leadStageTone(stage: string) {
  if (["ordered", "completed", "replied"].includes(stage)) return "success" as const;
  if (["lost", "rejected"].includes(stage)) return "danger" as const;
  if (["qualified", "quoting"].includes(stage)) return "warning" as const;
  if (["new", "contacting"].includes(stage)) return "info" as const;
  return "neutral" as const;
}

export function SupplierOverviewPage({ onNavigate }: SupplierOverviewPageProps) {
  const { t } = useTranslation();
  const isZh = i18n.language === "zh-CN";
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }

    fetch("/api/supplier/home-stats/", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.code === 200 && data.data) setStats(data.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className={styles.overviewMain}>
        <Card className={`${styles.overviewControlCard} ${styles.overviewLoadingCard}`}>
          <CardContent className={styles.overviewLoadingContent}>
            <Skeleton className={styles.overviewSkeletonTitle} />
            <Skeleton className={styles.overviewSkeletonLine} />
            <div className={styles.overviewSkeletonGrid}>
              <Skeleton className={styles.overviewSkeletonBlock} />
              <Skeleton className={styles.overviewSkeletonBlock} />
              <Skeleton className={styles.overviewSkeletonBlock} />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className={styles.overviewMain}>
        <Card className={styles.overviewControlCard}>
          <CardContent>
            <Empty className={styles.overviewEmptyState}>
              <EmptyHeader>
                <EmptyTitle>{t("supplier.loadFailed")}</EmptyTitle>
                <EmptyDescription>{t("supplier.overviewLoadFailedHint")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { leads, orders } = stats;
  const totalLeads = leads.total || 0;
  const getCountryName = (country: string) =>
    (isZh ? COUNTRY_NAMES[country]?.zh : COUNTRY_NAMES[country]?.en) || country;
  const getPercentWidth = (value: number) => (totalLeads > 0 ? `${(value / totalLeads) * 100}%` : "0%");
  const getPercent = (value: number) => (totalLeads > 0 ? Math.round((value / totalLeads) * 100) : 0);

  const primaryMetrics = [
    { label: t("supplier.newLeads"), value: leads.new },
    { label: t("supplier.contactingLeads"), value: leads.contacting },
    { label: t("supplier.qualifiedLeads"), value: leads.qualified },
    { label: t("supplier.convertedLeads"), value: leads.converted },
  ];
  const pipelineMetrics = [
    { label: t("supplier.newLeads"), value: leads.new, tone: "new" },
    { label: t("supplier.contactingLeads"), value: leads.contacting, tone: "contacting" },
    { label: t("supplier.qualifiedLeads"), value: leads.qualified, tone: "qualified" },
    { label: t("supplier.convertedLeads"), value: leads.converted, tone: "converted" },
  ];
  const coverageMetrics = [
    { label: "Phone", value: leads.with_phone, icon: Phone, tone: "green" },
    { label: "Email", value: leads.with_email, icon: Mail, tone: "blue" },
    { label: "WhatsApp", value: leads.with_whatsapp, icon: MessageCircle, tone: "lime" },
  ];
  const highScoreRate = getPercent(leads.score_high);
  const formattedOrderAmount = formatCurrency(orders.total_amount);

  return (
    <div className={styles.overviewMain}>
      <Card className={`${styles.overviewControlCard} ${styles.overviewHeroCard}`}>
        <CardContent className={styles.overviewHeroContent}>
          <div className={styles.overviewHeroMetric}>
            <span className={styles.overviewHeroLabel}>{t("supplier.totalLeads")}</span>
            <strong>{leads.total}</strong>
          </div>
          <div className={styles.overviewMetricCluster}>
            {primaryMetrics.map((metric) => (
              <div key={metric.label} className={styles.overviewMetricPill}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
          <div className={styles.overviewPipeline}>
            <div className={styles.overviewPipelineHeader}>
              <span>{t("supplier.overviewPipelineTitle")}</span>
              <strong>
                {t("supplier.overviewHighScoreSummary", {
                  count: leads.score_high,
                  total: totalLeads,
                  rate: highScoreRate,
                })}
              </strong>
            </div>
            <div className={styles.overviewPipelineTrack} aria-hidden="true">
              {pipelineMetrics.map((metric) => (
                <span
                  key={metric.label}
                  className={styles.overviewPipelineSegment}
                  data-tone={metric.tone}
                  style={{ width: metric.value > 0 ? getPercentWidth(metric.value) : "0%" }}
                />
              ))}
            </div>
            <div className={styles.overviewPipelineLegend}>
              {pipelineMetrics.map((metric) => (
                <span key={metric.label}>
                  <i data-tone={metric.tone} />
                  {metric.label} {metric.value}
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className={styles.overviewWorkbenchGrid}>
        <Card className={`${styles.overviewControlCard} ${styles.overviewLeadsCard}`}>
          <CardHeader className={styles.overviewCardHeader}>
            <div>
              <UiCardTitle className={styles.overviewCardTitle}>
                <UserRound size={17} aria-hidden="true" />
                {t("supplier.recentLeads")}
              </UiCardTitle>
            </div>
            <CardAction>
              <Badge variant="secondary" className={styles.overviewBadge}>
                {leads.recent.length}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            {leads.recent.length === 0 ? (
              <Empty className={styles.overviewEmptyState}>
                <EmptyHeader>
                  <EmptyTitle>{t("supplier.noData")}</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table className={styles.overviewLeadTable}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("supplier.colMerchant")}</TableHead>
                    <TableHead>{t("supplier.colCountry")}</TableHead>
                    <TableHead>{t("supplier.colFollowStage")}</TableHead>
                    <TableHead className={styles.overviewTableNumber}>{t("supplier.colScore")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.recent.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className={styles.overviewLeadName}>
                          <strong>{r.merchant_name}</strong>
                          <span>{r.company_name || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getCountryName(r.country)}</TableCell>
                      <TableCell>
                        <BackendStatusBadge tone={leadStageTone(r.stage)}>
                          {r.stage || t("supplier.noData")}
                        </BackendStatusBadge>
                      </TableCell>
                      <TableCell className={styles.overviewTableNumber}>
                        <Badge
                          variant="secondary"
                          className={styles.overviewScoreBadge}
                          data-exceptional={r.score >= 80}
                        >
                          {r.score}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className={styles.overviewInsightStack}>
          <Card className={`${styles.overviewControlCard} ${styles.overviewOrderCard}`}>
            <CardHeader className={styles.overviewCardHeader}>
              <div>
                <UiCardTitle className={styles.overviewCardTitle}>
                  <LineChart size={17} aria-hidden="true" />
                  {t("supplier.ordersOverview")}
                </UiCardTitle>
              </div>
              <CardAction>
                <Button type="button" variant="outline" size="sm" onClick={() => onNavigate("orders-summary")}>
                  {t("supplier.viewAllOrders")}
                  <ArrowRight data-icon="inline-end" aria-hidden="true" />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className={styles.overviewOrderStats}>
                <div>
                  <span>{t("supplier.orderTotal")}</span>
                  <strong>{orders.total}</strong>
                </div>
                <div>
                  <span>{t("supplier.orderAmount")}</span>
                  <strong>{formattedOrderAmount}</strong>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={`${styles.overviewControlCard} ${styles.overviewInsightCard}`}>
            <CardHeader className={styles.overviewCardHeader}>
              <div>
                <UiCardTitle className={styles.overviewCardTitle}>
                  <Target size={17} aria-hidden="true" />
                  {t("supplier.contactCoverage")}
                </UiCardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className={styles.overviewInsightRows}>
                {coverageMetrics.map((metric) => {
                  const Icon = metric.icon;
                  return (
                    <div key={metric.label} className={styles.overviewInsightRow}>
                      <span className={styles.overviewInsightLabel}>
                        <Icon size={15} aria-hidden="true" />
                        {metric.label}
                      </span>
                      <div className={styles.overviewInsightBar}>
                        <i data-tone={metric.tone} style={{ width: getPercentWidth(metric.value) }} />
                      </div>
                      <strong>{metric.value}/{totalLeads}</strong>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className={`${styles.overviewControlCard} ${styles.overviewInsightCard}`}>
            <CardHeader className={styles.overviewCardHeader}>
              <div>
                <UiCardTitle className={styles.overviewCardTitle}>
                  <TrendingUp size={17} aria-hidden="true" />
                  {t("supplier.scoreDistribution")}
                </UiCardTitle>
              </div>
              <CardAction>
                <Badge variant="outline" className={styles.overviewBadge}>
                  <BadgeCheck aria-hidden="true" />
                  {highScoreRate}%
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className={styles.overviewInsightRows}>
                {[
                  { label: t("supplier.scoreHigh"), value: leads.score_high, tone: "green" },
                  { label: t("supplier.scoreMid"), value: leads.score_mid, tone: "amber" },
                  { label: t("supplier.scoreLow"), value: leads.score_low, tone: "red" },
                ].map((metric) => (
                  <div key={metric.label} className={styles.overviewInsightRow}>
                    <span className={styles.overviewInsightLabel}>{metric.label}</span>
                    <div className={styles.overviewInsightBar}>
                      <i data-tone={metric.tone} style={{ width: getPercentWidth(metric.value) }} />
                    </div>
                    <strong>{metric.value}</strong>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className={`${styles.overviewControlCard} ${styles.overviewInsightCard}`}>
            <CardHeader className={styles.overviewCardHeader}>
              <div>
                <UiCardTitle className={styles.overviewCardTitle}>
                  <Globe2 size={17} aria-hidden="true" />
                  {t("supplier.countryDistribution")}
                </UiCardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {leads.countries.length === 0 ? (
                <p className={styles.overviewEmpty}>{t("supplier.noData")}</p>
              ) : (
                <div className={styles.overviewCountryList}>
                  {leads.countries.map((c) => (
                    <div key={c.country} className={styles.overviewCountryRow}>
                      <span>{getCountryName(c.country)}</span>
                      <div>
                        <i style={{ width: getPercentWidth(c.count) }} />
                      </div>
                      <strong>{c.count}</strong>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
