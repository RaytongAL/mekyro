import { useEffect, useState } from "react";
import { ArrowRight, UserRound, PackageCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import styles from "./supplier-shell.module.css";

type HomeStats = {
  leads: {
    total: number;
    new: number;
    contacting: number;
    qualified: number;
    converted: number;
    high_score: number;
  };
  orders: {
    total: number;
    pending: number;
    fulfilling: number;
    completed: number;
    total_amount: string;
  };
};

function getToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)ai_trade_token=([^;]*)/);
  return match?.[1] ?? null;
}

function formatCurrency(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `¥${value}`;

  return `¥${new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: numeric % 1 === 0 ? 0 : 2,
  }).format(numeric)}`;
}

type SupplierHomeCardsProps = {
  onNavigate: (page: string) => void;
};

function HomeCardSkeleton({ label }: { label: string }) {
  return (
    <div className={styles.homeLoadingState}>
      <p>{label}</p>
      <div className={styles.homeSkeletonGrid} aria-hidden="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <span className={styles.homeSkeletonMetric} key={index}>
            <i className={styles.homeSkeletonLine} />
            <b className={styles.homeSkeletonValue} />
          </span>
        ))}
      </div>
    </div>
  );
}

export function SupplierHomeCards({ onNavigate }: SupplierHomeCardsProps) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<HomeStats | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    fetch("/api/supplier/home-stats/", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.code === 200 && data.data) {
          setStats(data.data);
        }
      })
      .catch(() => {});
  }, []);

  const leadStats = stats?.leads;
  const orderStats = stats?.orders;
  const formattedOrderAmount = orderStats ? formatCurrency(orderStats.total_amount) : "";

  return (
    <div className={styles.homeCards}>
      {/* 线索概览 */}
      <section className={`${styles.whiteCard} ${styles.homeSummaryCard}`}>
        <div className={styles.cardTitle}>
          <UserRound size={22} aria-hidden="true" />
          <h2>{t("supplier.leadsOverview")}</h2>
        </div>
        {leadStats ? (
          <div className={styles.homeSalesGrid}>
            {[
              { label: t("supplier.totalLeads"), value: leadStats.total },
              { label: t("supplier.newLeads"), value: leadStats.new },
              { label: t("supplier.contactingLeads"), value: leadStats.contacting },
              { label: t("supplier.qualifiedLeads"), value: leadStats.qualified },
              { label: t("supplier.convertedLeads"), value: leadStats.converted },
              { label: t("supplier.highScoreLeads"), value: leadStats.high_score },
            ].map((metric) => (
              <div className={styles.homeSalesMetric} key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
        ) : (
          <HomeCardSkeleton label={t("supplier.loading")} />
        )}
        <div className={styles.cardFooterAction}>
          <button type="button" onClick={() => onNavigate("leads")}>
            {t("supplier.viewAllLeads")}
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      </section>

      {/* 订单概览 */}
      <section className={`${styles.whiteCard} ${styles.homeSummaryCard}`}>
        <div className={styles.cardTitle}>
          <PackageCheck size={22} aria-hidden="true" />
          <h2>{t("supplier.ordersOverview")}</h2>
        </div>
        {orderStats ? (
          <div className={styles.homeOrderMetricGrid}>
            {[
              { label: t("supplier.orderTotal"), value: orderStats.total },
              { label: t("supplier.orderPending"), value: orderStats.pending },
              { label: t("supplier.orderFulfilling"), value: orderStats.fulfilling },
              { label: t("supplier.orderCompleted"), value: orderStats.completed },
            ].map((metric) => (
              <div className={styles.homeSalesMetric} key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
            <div className={`${styles.homeSalesMetric} ${styles.homeAmountMetric}`}>
              <span>{t("supplier.orderAmount")}</span>
              <strong className={styles.homeAmountValue}>{formattedOrderAmount}</strong>
            </div>
          </div>
        ) : (
          <HomeCardSkeleton label={t("supplier.loading")} />
        )}
        <div className={styles.cardFooterAction}>
          <button type="button" onClick={() => onNavigate("orders-summary")}>
            {t("supplier.viewAllOrders")}
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  );
}
