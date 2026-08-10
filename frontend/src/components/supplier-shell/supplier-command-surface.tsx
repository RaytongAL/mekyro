import {
  Activity,
  BadgeCheck,
  Bot,
  ClipboardCheck,
  ChevronLeft,
  FileText,
  LineChart,
  PackageCheck,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import i18n from "@/i18n";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { CommandChatPanel } from "./command-chat-panel";
import { SupplierLeadsPage } from "./supplier-leads-page";
import { SupplierContactLogsPage } from "./supplier-contact-logs-page";
import { SupplierProductsPage } from "./supplier-products-page";
import { SupplierInventoryLogsPage } from "./supplier-inventory-logs-page";
import { SupplierSettingsPage } from "./supplier-settings-page";
import { SupplierHomeCards } from "./supplier-home-cards";
import { SupplierOverviewPage } from "./supplier-overview-page";
import styles from "./supplier-shell.module.css";
import { ReviewCard } from "./review-card";
import { SupplierEmptyState } from "./supplier-state-panel";
import {
  supplierAccountProfile,
  supplierAiEvolutionReadiness,
  supplierAiLabExperiments,
  supplierAuthorizationItems,
  supplierCustomerDetail,
  supplierCustomerRows,
  supplierCustomerSummaryMetrics,
  supplierHomeTodos,
  supplierLiveOpsMetrics,
  supplierLiveOpsTimeline,
  supplierOrderTimeRanges,
  supplierOpportunityOrderLinks,
  supplierOpportunityProgress,
  supplierOverviewAiReadiness,
  supplierOverviewCockpitMetrics,
  supplierOverviewDataAccessStatus,
  supplierOverviewOrderHealth,
  supplierDataAccessSubmissions,
  supplierDataAccessTypes,
  supplierReportPackages,
  supplierSalesHomeSummary,
  supplierShippingFormFields,
  supplierShippingInfoSummary,
  supplierShippingSubmissions,
  supplierLiveOperations,
  supplierReviewCards,
  supplierTodoClosedLoops,
  supplierTodoSummaryMetrics,
  supplierWorkReportRows,
} from "@/lib/ai-native-command/synthetic-command-data";

export type SupplierPageId =
  | "home"
  | "todo-items"
  | "chat"
  | "overview"
  | "customer-summary"
  | "customer-detail"
  | "leads"
  | "contact-logs"
  | "orders-summary"
  | "orders-detail"
  | "shipping-info"
  | "live-ops"
  | "ai-evolution"
  | "work-report"
  | "account-info"
  | "authorization"
  | "data-access"
  | "supplier-products"
  | "supplier-inventory-logs"
  | "supplier-settings";

const supplierAssistantPages: ReadonlySet<SupplierPageId> = new Set([
  "overview",
  "leads",
  "contact-logs",
  "supplier-products",
  "supplier-inventory-logs",
  "supplier-settings",
  "orders-summary",
  "orders-detail",
]);

export function supplierPageHasAssistant(page: SupplierPageId) {
  return supplierAssistantPages.has(page);
}

type SupplierCommandSurfaceProps = {
  activePage: SupplierPageId;
  chatReturnPage: SupplierPageId;
  activeTodoId: string | null;
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void;
  onOpenChat: () => void;
  assistantOpen: boolean;
  onAssistantOpenChange: (open: boolean) => void;
};

type SupplierOrderItem = {
  id: string;
  variant_id: string;
  quantity: number;
  unit_price: string;
};

type SupplierOrder = {
  id: string;
  lead_id: string | null;
  order_number: string;
  total_amount: string;
  currency: string;
  order_status: string;
  payment_status: string;
  items: SupplierOrderItem[];
  shipments: Array<{ id: string; shipping_status: string; carrier: string; tracking_number: string }>;
  created_at: string;
};

type VariantDisplay = { productName: string; skuCode: string };

function CardTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className={styles.cardTitle}>
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

function StatGrid({
  items,
}: {
  items: Array<{ label: string; value: string; helper: string }>;
}) {
  return (
    <div className={styles.statGrid}>
      {items.map((item) => (
        <article key={item.label} className={styles.statTile}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <small>{item.helper}</small>
        </article>
      ))}
    </div>
  );
}

function SectionIntro({ children }: { children: ReactNode }) {
  return <p className={styles.sectionIntro}>{children}</p>;
}

function OperationalSection({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`${styles.whiteCard} ${styles.operationalSection}`}>
      <div className={styles.operationalSectionHeader}>
        <CardTitle icon={icon} title={title} />
        {description ? <SectionIntro>{description}</SectionIntro> : null}
      </div>
      <div className={styles.operationalSectionBody}>{children}</div>
    </section>
  );
}

function AssistantSheetLayout({
  children,
  open,
  onOpenChange,
  onOpenFullChat,
  title,
}: {
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenFullChat: () => void;
  title: string;
}) {
  const handleOpenFullChat = () => {
    onOpenChange(false);
    onOpenFullChat();
  };

  return (
    <div className={styles.contentMain}>
      {children}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className={styles.assistantSheet}>
          <SheetHeader className={styles.assistantSheetHeader}>
            <SheetTitle className={styles.srOnly}>{title}</SheetTitle>
          </SheetHeader>
          <div className={styles.assistantSheetBody}>
            <CommandChatPanel mode="rail" onOpenFullChat={handleOpenFullChat} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function SupplierCommandSurface({
  activePage,
  chatReturnPage,
  activeTodoId,
  onNavigate,
  onOpenChat,
  assistantOpen,
  onAssistantOpenChange,
}: SupplierCommandSurfaceProps) {
  const [activeOrderRange, setActiveOrderRange] = useState("本月");
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [variantDisplay, setVariantDisplay] = useState<Record<string, VariantDisplay>>({});
  const { t } = useTranslation();
  const isZh = i18n.language === "zh";
  const assistantLabels = {
    title: t("supplier.assistantSheetTitle"),
  };

  useEffect(() => {
    if (activePage !== "orders-summary" && activePage !== "orders-detail") return;
    const controller = new AbortController();
    setOrdersLoading(true);
    setOrdersError("");
    Promise.all([
      fetch("/api/supplier/orders/?page=1&page_size=100", { signal: controller.signal }).then((response) => response.json()),
      fetch("/api/supplier/products/?page=1&page_size=100", { signal: controller.signal }).then((response) => response.json()),
    ])
      .then(([orderPayload, productPayload]) => {
        if (orderPayload?.code !== 200) throw new Error(orderPayload?.message || "Order list failed");
        const nextOrders = (orderPayload.data?.results ?? []) as SupplierOrder[];
        const lookup: Record<string, VariantDisplay> = {};
        for (const product of productPayload?.data?.results ?? []) {
          for (const variant of product.variants ?? product.skus ?? []) {
            lookup[String(variant.id)] = { productName: String(product.name || ""), skuCode: String(variant.sku_code || "") };
          }
        }
        setOrders(nextOrders);
        setVariantDisplay(lookup);
        setSelectedOrderId((current) => current && nextOrders.some((item) => item.id === current) ? current : nextOrders[0]?.id ?? null);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setOrdersError(isZh ? "订单数据加载失败。" : "Orders could not be loaded.");
      })
      .finally(() => setOrdersLoading(false));
    return () => controller.abort();
  }, [activePage, isZh]);
  const renderWithAssistantSheet = (
    content: ReactNode,
    onOpenFullChat: () => void,
    labels: { title: string },
  ) => (
    <AssistantSheetLayout
      open={assistantOpen}
      onOpenChange={onAssistantOpenChange}
      onOpenFullChat={onOpenFullChat}
      title={labels.title}
    >
      {content}
    </AssistantSheetLayout>
  );

  return (
    <section className={styles.surfacePanel} data-active-page={activePage}>
      {activePage === "home" ? renderHome(t, onOpenChat, onNavigate) : null}
      {activePage === "todo-items" ? renderTodoItems(t, onNavigate, activeTodoId) : null}
      {activePage === "chat" ? renderChat(t, chatReturnPage, onNavigate) : null}
      {activePage === "overview"
        ? renderWithAssistantSheet(
            <SupplierOverviewPage onNavigate={(page) => onNavigate(page as SupplierPageId)} />,
            onOpenChat,
            assistantLabels,
          )
        : null}
      {activePage === "leads"
        ? renderWithAssistantSheet(<SupplierLeadsPage />, onOpenChat, assistantLabels)
        : null}
      {activePage === "contact-logs"
        ? renderWithAssistantSheet(<SupplierContactLogsPage />, onOpenChat, assistantLabels)
        : null}
      {activePage === "supplier-products"
        ? renderWithAssistantSheet(<SupplierProductsPage />, onOpenChat, assistantLabels)
        : null}
      {activePage === "supplier-inventory-logs"
        ? renderWithAssistantSheet(<SupplierInventoryLogsPage />, onOpenChat, assistantLabels)
        : null}
      {activePage === "supplier-settings"
        ? renderWithAssistantSheet(<SupplierSettingsPage />, onOpenChat, assistantLabels)
        : null}
      {activePage === "orders-summary"
        ? renderWithAssistantSheet(
            renderOrdersSummary(t, onNavigate, activeOrderRange, setActiveOrderRange, orders, ordersLoading, ordersError, setSelectedOrderId),
            onOpenChat,
            assistantLabels,
          )
        : null}
      {activePage === "orders-detail"
        ? renderWithAssistantSheet(
            renderOrdersDetail(t, activeTodoId, onNavigate, orders, selectedOrderId, setSelectedOrderId, variantDisplay, ordersLoading, ordersError),
            onOpenChat,
            assistantLabels,
          )
        : null}
      {activePage === "shipping-info" ? renderShippingInfo(t, activeTodoId, onNavigate) : null}
      {activePage === "live-ops" ? renderLiveOps(t) : null}
      {activePage === "ai-evolution" ? renderAiEvolution(t) : null}
      {activePage === "work-report" ? renderWorkReport(t) : null}
      {activePage === "account-info" ? renderAccountInfo(t) : null}
      {activePage === "authorization" ? renderAuthorization(t, activeTodoId, onNavigate) : null}
      {activePage === "data-access" ? renderDataAccess(t, activeTodoId, onNavigate) : null}
    </section>
  );
}

function renderHome(
  t: TFunction,
  onOpenChat: () => void,
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void,
) {
  return (
    <>
      <CommandChatPanel mode="entry" onOpenFullChat={onOpenChat} />
      <SupplierHomeCards onNavigate={(page) => onNavigate(page as SupplierPageId)} />
    </>
  );
}

function renderTodoItems(
  t: TFunction,
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void,
  activeTodoId: string | null,
) {
  return (
    <div className={styles.overviewMain}>
      <button
        type="button"
        className={styles.backButton}
        onClick={() => onNavigate("home")}
      >
        {t("supplier.backToHome")}
      </button>

      <OperationalSection
        icon={<ClipboardCheck size={22} aria-hidden="true" />}
        title={t("supplier.todoTitle")}
        description={t("supplier.todoIntro")}
      >
        <StatGrid items={supplierTodoSummaryMetrics} />
      </OperationalSection>

      <OperationalSection
        icon={<BadgeCheck size={22} aria-hidden="true" />}
        title={t("supplier.closedLoopExample")}
      >
        <div className={styles.todoLoopList}>
          {supplierTodoClosedLoops.map((todo, index) => (
            <article
              key={todo.id}
              className={
                activeTodoId === todo.id
                  ? `${styles.todoLoopItem} ${styles.todoLoopItemActive}`
                  : styles.todoLoopItem
              }
              data-todo-loop={todo.id}
            >
              <div className={styles.todoLoopNumber}>{index + 1}</div>
              <div className={styles.todoLoopMain}>
                <span>{todo.category} · {todo.role} · {todo.priority}{t("supplier.prioritySuffix")}</span>
                <strong>{todo.title}</strong>
                <p>{todo.reason}</p>
                <div className={styles.todoStepList}>
                  <p>
                    <b>{t("supplier.aiPrepared")}</b>
                    {todo.aiPrepared}
                  </p>
                  <p>
                    <b>{t("supplier.processingPage")}</b>
                    {todo.destinationLabel}
                  </p>
                  <p>
                    <b>{t("supplier.statusLoop")}</b>
                    {todo.closedLoop}
                  </p>
                </div>
              </div>
              <div className={styles.todoActionStack}>
                <button
                  type="button"
                  onClick={() =>
                    onNavigate(todo.destinationPage as SupplierPageId, { todoId: todo.id })
                  }
                >
                  <span>{t("supplier.goProcess")}</span>
                  <strong>{todo.destinationLabel}</strong>
                </button>
                {todo.relatedPage ? (
                  <button
                    type="button"
                    onClick={() => onNavigate(todo.relatedPage as SupplierPageId, { todoId: todo.id })}
                  >
                    <span>{t("supplier.viewRelated")}</span>
                    <strong>{todo.relatedDestinationLabel}</strong>
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </OperationalSection>

      <OperationalSection
        icon={<Bot size={22} aria-hidden="true" />}
        title={t("supplier.boundaryTitle")}
      >
        <div className={styles.boundaryList}>
          <p>{t("supplier.boundary1")}</p>
          <p>{t("supplier.boundary2")}</p>
          <p>{t("supplier.boundary3")}</p>
        </div>
      </OperationalSection>
    </div>
  );
}

function renderChat(
  t: TFunction,
  chatReturnPage: SupplierPageId,
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void,
) {
  const backLabel = t("supplier.backToPrevious").replace(/^←\s*/, "");

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={styles.chatBackButton}
        onClick={() => onNavigate(chatReturnPage === "chat" ? "home" : chatReturnPage)}
      >
        <ChevronLeft data-icon="inline-start" aria-hidden="true" />
        {backLabel}
      </Button>
      <CommandChatPanel mode="full" />
    </>
  );
}

function getActiveTodo(todoId: string | null) {
  if (!todoId) return null;
  return supplierTodoClosedLoops.find((todo) => todo.id === todoId) ?? null;
}

function renderTodoReturnBar(
  t: TFunction,
  activeTodoId: string | null,
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void,
) {
  const activeTodo = getActiveTodo(activeTodoId);
  if (!activeTodo) return null;

  return (
    <div className={styles.todoReturnBar}>
      <button
        type="button"
        onClick={() => onNavigate("todo-items", { todoId: activeTodo.id })}
      >
        {t("supplier.backToTodos")}
      </button>
      <span>
        {t("supplier.currentTodo")}<strong>{activeTodo.title}</strong>
      </span>
    </div>
  );
}

function renderTodoProcessingPanel(
  t: TFunction,
  activeTodoId: string | null,
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void,
) {
  const activeTodo = getActiveTodo(activeTodoId);
  if (!activeTodo) return null;

  return (
    <section className={`${styles.whiteCard} ${styles.todoProcessingCard}`}>
      <CardTitle icon={<ClipboardCheck size={22} aria-hidden="true" />} title={t("supplier.currentTodoProcessing")} />
      <div className={styles.todoProcessingHeader}>
        <span>{activeTodo.category} · {activeTodo.role}</span>
        <strong>{activeTodo.title}</strong>
        <p>{activeTodo.reason}</p>
      </div>
      <div className={styles.todoProcessingGrid}>
        <article>
          <span>{t("supplier.thisPageAction")}</span>
          <strong>{activeTodo.detailTitle}</strong>
          <p>{activeTodo.nextAction}</p>
        </article>
        <article>
          <span>{t("supplier.aiPrepared")}</span>
          <strong>{t("supplier.candidateSummary")}</strong>
          <p>{activeTodo.aiPrepared}</p>
        </article>
        <article>
          <span>{t("supplier.afterComplete")}</span>
          <strong>{t("supplier.statusReturn")}</strong>
          <p>{activeTodo.closedLoop}</p>
        </article>
      </div>
      <div className={styles.todoProcessingActions}>
        <button
          type="button"
          onClick={() => onNavigate("todo-items", { todoId: activeTodo.id })}
        >
          {t("supplier.backToTodosBtn")}
        </button>
        {activeTodo.relatedPage ? (
          <button
            type="button"
            onClick={() =>
              onNavigate(activeTodo.relatedPage as SupplierPageId, { todoId: activeTodo.id })
            }
          >
            {t("supplier.viewRelatedPage")}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function renderOrdersSummary(
  t: TFunction,
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void,
  activeOrderRange: string,
  setActiveOrderRange: (range: string) => void,
  orders: SupplierOrder[],
  loading: boolean,
  error: string,
  setSelectedOrderId: (id: string) => void,
) {
  const isZh = i18n.language === "zh-CN";
  const revenue = orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const metrics = [
    { label: isZh ? "订单总量" : "Total Orders", value: String(orders.length), helper: isZh ? "当前工作区订单" : "Current workspace orders" },
    { label: isZh ? "成交收入" : "Revenue", value: new Intl.NumberFormat(isZh ? "zh-CN" : "en-US", { style: "currency", currency: orders[0]?.currency || "USD" }).format(revenue), helper: isZh ? "订单总金额" : "Total order amount" },
    { label: isZh ? "履约正常" : "On Track", value: String(orders.filter((order) => !["cancelled"].includes(order.order_status)).length), helper: isZh ? "未取消订单" : "Non-cancelled orders" },
    { label: isZh ? "需要补资料" : "Needs Info", value: String(orders.filter((order) => order.order_status === "confirmed" && order.shipments.length === 0).length), helper: isZh ? "已确认但未建立物流" : "Confirmed without shipment" },
  ];
  return (
    <div className={styles.overviewMain}>
      <OperationalSection
        icon={<LineChart size={22} aria-hidden="true" />}
        title={t("supplier.ordersSummaryTitle")}
      >
        <div className={styles.timeFilter} aria-label="订单时间范围">
          {supplierOrderTimeRanges.map((range) => (
            <button
              key={range.label}
              type="button"
              aria-pressed={range.label === activeOrderRange || range.labelEn === activeOrderRange}
              className={range.label === activeOrderRange || range.labelEn === activeOrderRange ? styles.timeFilterActive : undefined}
              onClick={() => setActiveOrderRange(isZh ? range.label : range.labelEn)}
            >
              {isZh ? range.label : range.labelEn}
            </button>
          ))}
        </div>
        <div className={`${styles.cockpitGrid} ${styles.orderSummaryStats}`}>
          {metrics.map((item) => (
            <article key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.helper}</small>
            </article>
          ))}
        </div>
      </OperationalSection>

      <OperationalSection
        icon={<PackageCheck size={22} aria-hidden="true" />}
        title={t("supplier.orderList")}
        description={t("supplier.orderListIntro")}
      >
        <div className={styles.orderSummaryList}>
          {loading ? (
            <p className={styles.emptyText}>{t("common.loading")}</p>
          ) : error ? (
            <p className={styles.emptyText}>{error}</p>
          ) : orders.length === 0 ? (
            <p className={styles.emptyText}>{t("supplier.noOrders")}</p>
          ) : (
            <>
              <div className={styles.orderSummaryHeader} aria-hidden="true">
                <span>{t("supplier.headerOrder")}</span>
                <span>{t("supplier.headerCustomer")}</span>
                <span>{t("supplier.headerStatus")}</span>
                <span>{t("supplier.headerNext")}</span>
                <span>{t("supplier.headerAmountOwner")}</span>
              </div>
              {orders.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  className={styles.orderSummaryRow}
                  onClick={() => { setSelectedOrderId(order.id); onNavigate("orders-detail"); }}
                >
                  <strong>{order.order_number}</strong>
                  <span>{order.lead_id ? `#${order.lead_id.slice(0, 8)}` : "—"}</span>
                  <span>{order.order_status}</span>
                  <span>{order.payment_status}</span>
                  <em>{new Intl.NumberFormat(isZh ? "zh-CN" : "en-US", { style: "currency", currency: order.currency }).format(Number(order.total_amount))}</em>
                </button>
              ))}
            </>
          )}
        </div>
      </OperationalSection>
      <OperationalSection
        icon={<TrendingUp size={22} aria-hidden="true" />}
        title={t("supplier.opportunityLinkTitle")}
        description={t("supplier.opportunityLinkIntro")}
      >
        <div className={styles.orderLinkList}>
          {supplierOpportunityOrderLinks.map((item) => (
            <div key={item.label} className={styles.tableRow}>
              <strong>
                {item.label}
                <small>{item.value}</small>
              </strong>
              <span>{item.helper}</span>
              <em>{t("supplier.linked")}</em>
            </div>
          ))}
        </div>
      </OperationalSection>
    </div>
  );
}

function renderCustomerSummary(
  t: TFunction,
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void,
) {
  return (
    <div className={styles.overviewMain}>
      <StatGrid items={supplierCustomerSummaryMetrics} />
      <section className={styles.whiteCard}>
        <CardTitle icon={<UserRound size={22} aria-hidden="true" />} title={t("supplier.customerSummaryTitle")} />
        <SectionIntro>
          {t("supplier.customerSummaryIntro")}
        </SectionIntro>
        <div className={styles.customerList}>
          <div className={styles.customerListHeader} aria-hidden="true">
            <span>{t("supplier.headerCustomerName")}</span>
            <span>{t("supplier.headerSource")}</span>
            <span>{t("supplier.headerStage")}</span>
            <span>{t("supplier.headerRecentAction")}</span>
            <span>{t("supplier.headerOrderState")}</span>
          </div>
          {supplierCustomerRows.map((customer) => (
            <button
              key={customer.id}
              type="button"
              className={styles.customerListItem}
              onClick={() => onNavigate("customer-detail")}
            >
              <strong>{customer.name}</strong>
              <span>{customer.source}</span>
              <span>{customer.stage}</span>
              <span>{customer.recentAction}</span>
              <em>{customer.orderState}</em>
            </button>
          ))}
        </div>
        <div className={styles.paginationBar} aria-label="客户分页">
          <span>{t("supplier.pageInfo")}</span>
          <div>
            <button type="button" disabled>{t("supplier.prevPage")}</button>
            <button type="button">{t("supplier.nextPage")}</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function renderCustomerDetail(
  t: TFunction,
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void,
) {
  return (
    <div className={styles.overviewMain}>
      <div className={styles.pageBackRow}>
        <button
          type="button"
          className={styles.pageBackButton}
          onClick={() => onNavigate("customer-summary")}
        >
          {t("supplier.backToCustomerSummary")}
        </button>
      </div>
      <section className={styles.whiteCard}>
        <CardTitle icon={<UserRound size={22} aria-hidden="true" />} title={t("supplier.customerDetailTitle")} />
        <SectionIntro>
          {t("supplier.customerDetailIntro")}
        </SectionIntro>
        <div className={styles.customerDetailGrid}>
          <article>
            <span>{t("supplier.fieldName")}</span>
            <strong>{supplierCustomerDetail.name}</strong>
            <p>{supplierCustomerDetail.region} · {supplierCustomerDetail.source}</p>
          </article>
          <article>
            <span>{t("supplier.fieldStage")}</span>
            <strong>{supplierCustomerDetail.stage}</strong>
            <p>{supplierCustomerDetail.nextAction}</p>
          </article>
          <article>
            <span>{t("supplier.fieldLastContact")}</span>
            <strong>{supplierCustomerDetail.lastContact}</strong>
            <p>{supplierCustomerDetail.communicationSummary}</p>
          </article>
          <article>
            <span>{t("supplier.fieldRelatedOrders")}</span>
            <strong>{supplierCustomerDetail.relatedOrders}</strong>
            <p>{supplierCustomerDetail.orderNote}</p>
          </article>
        </div>
      </section>

      <section className={styles.whiteCard}>
        <CardTitle icon={<TrendingUp size={22} aria-hidden="true" />} title={t("supplier.needsAndOpportunity")} />
        <div className={styles.detailStack}>
          {supplierCustomerDetail.needs.map((item) => (
            <p key={item}>{item}</p>
          ))}
          {supplierCustomerDetail.missingInputs.map((item) => (
            <p key={item}>{t("supplier.pendingPrefix")}{item}</p>
          ))}
        </div>
        <div className={styles.cardFooterAction}>
          <button type="button" onClick={() => onNavigate("data-access")}>
            {t("supplier.goToDataAccess")}
          </button>
          <button type="button" onClick={() => onNavigate("orders-summary")}>
            {t("supplier.viewOrdersSummary")}
          </button>
        </div>
      </section>
    </div>
  );
}

function renderOrdersDetail(
  t: TFunction,
  activeTodoId: string | null,
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void,
  orders: SupplierOrder[],
  selectedOrderId: string | null,
  setSelectedOrderId: (id: string) => void,
  variantDisplay: Record<string, VariantDisplay>,
  loading: boolean,
  error: string,
) {
  const isZh = i18n.language === "zh-CN";
  const selected = orders.find((order) => order.id === selectedOrderId) ?? orders[0] ?? null;
  const money = (order: SupplierOrder) => new Intl.NumberFormat(isZh ? "zh-CN" : "en-US", {
    style: "currency",
    currency: order.currency,
  }).format(Number(order.total_amount));
  return (
    <div className={styles.overviewMain}>
      {renderTodoReturnBar(t, activeTodoId, onNavigate)}
      <div className={styles.orderDetailGrid}>
        <OperationalSection
          icon={<PackageCheck size={22} aria-hidden="true" />}
          title={t("supplier.ordersDetailTitle")}
          description={t("supplier.ordersDetailIntro")}
        >
          <div className={styles.orderList}>
            {loading ? (
              <p className={styles.emptyText}>{t("common.loading")}</p>
            ) : error ? (
              <p className={styles.emptyText}>{error}</p>
            ) : orders.length === 0 ? (
              <p className={styles.emptyText}>{t("supplier.noOrders")}</p>
            ) : (
              orders.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  className={order.id === selected?.id ? styles.orderListItemActive : styles.orderListItem}
                  onClick={() => setSelectedOrderId(order.id)}
                >
                  <strong>
                    {order.order_number}
                    <small>{new Date(order.created_at).toLocaleDateString(isZh ? "zh-CN" : "en-US")}</small>
                  </strong>
                  <span>{order.order_status}</span>
                  <em>{money(order)}</em>
                </button>
              ))
            )}
          </div>
        </OperationalSection>

        <OperationalSection
          icon={<FileText size={22} aria-hidden="true" />}
          title={t("supplier.currentOrderDetail")}
        >
          {selected ? (
            <div className={styles.orderDetailFacts}>
              <article>
                <span>{isZh ? "订单编号" : "Order number"}</span>
                <strong>{selected.order_number}</strong>
                <p>{isZh ? "创建时间" : "Created"}: {new Date(selected.created_at).toLocaleString(isZh ? "zh-CN" : "en-US")}</p>
              </article>
              <article>
                <span>{t("supplier.fieldOrderAmount")}</span>
                <strong>{money(selected)}</strong>
                <p>{selected.order_status} / {selected.payment_status}</p>
              </article>
              <article>
                <span>{t("supplier.fieldProductQuantity")}</span>
                <strong>{selected.items.reduce((sum, item) => sum + item.quantity, 0)} {isZh ? "件" : "units"}</strong>
                <p>{selected.items.length} SKU</p>
              </article>
              <article>
                <span>{t("supplier.fieldCustomer")}</span>
                <strong>{selected.lead_id ? `#${selected.lead_id.slice(0, 8)}` : "—"}</strong>
                <p>{isZh ? "关联线索" : "Related lead"}</p>
              </article>
            </div>
          ) : <p className={styles.emptyText}>{t("supplier.noOrders")}</p>}
        </OperationalSection>
      </div>

      <div className={styles.twoColumn}>
        <OperationalSection
          icon={<Activity size={22} aria-hidden="true" />}
          title={t("supplier.fulfillmentTimeline")}
        >
          {selected?.shipments.length ? <div className={styles.timeline}>{selected.shipments.map((shipment, index) => (
            <div key={shipment.id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{shipment.shipping_status}<small>{shipment.carrier || "—"} {shipment.tracking_number || ""}</small></strong>
            </div>
          ))}</div> : <p className={styles.emptyText}>{isZh ? "暂无物流记录" : "No shipment yet"}</p>}
        </OperationalSection>
        <OperationalSection
          icon={<ClipboardCheck size={22} aria-hidden="true" />}
          title={t("supplier.evidenceAndMissing")}
        >
          {selected?.items.length ? <div className={styles.detailStack}>{selected.items.map((item) => {
            const display = variantDisplay[item.variant_id];
            return <p key={item.id}><strong>{display?.productName || (isZh ? "商品" : "Product")}</strong> {display?.skuCode || `#${item.variant_id.slice(0, 8)}`} · {item.quantity} × {item.unit_price} {selected.currency}</p>;
          })}</div> : <p className={styles.emptyText}>{isZh ? "暂无订单商品" : "No order items"}</p>}
        </OperationalSection>
      </div>
    </div>
  );
}

function renderShippingInfo(
  t: TFunction,
  activeTodoId: string | null,
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void,
) {
  const isZh = i18n.language === "zh-CN";
  const shippingStats = supplierShippingInfoSummary.map((item) => ({
    label: isZh ? item.label : item.labelEn,
    value: item.value,
    helper: isZh ? item.helper : item.helperEn,
  }));
  const shippingFormFields = supplierShippingFormFields.map((item) => ({
    ...item,
    displayLabel: isZh ? item.label : item.labelEn,
    displayValue: isZh ? (item as any).value || item.value : (item as any).valueEn || item.value,
    displayHelper: isZh ? item.helper : (item as any).helperEn || item.helper,
  }));
  const shippingPrimaryFields = shippingFormFields.slice(0, 3);
  const shippingNoteField = shippingFormFields[3];
  const noSubmissionsTitle = isZh ? "暂无提交记录" : "No submissions yet";
  const noSubmissionsDescription = isZh
    ? "有发货提交后，这里会显示最近提交、处理状态和回流提醒。"
    : "Recent submissions, processing status, and follow-up reminders will appear here after a shipment is submitted.";

  return (
    <div className={styles.overviewMain}>
      {renderTodoReturnBar(t, activeTodoId, onNavigate)}
      {activeTodoId === "SYN-TODO-PACKAGING-PHOTO"
        ? renderTodoProcessingPanel(t, activeTodoId, onNavigate)
        : null}
      <StatGrid items={shippingStats} />

      <section className={`${styles.whiteCard} ${styles.shippingCard}`}>
        <CardTitle icon={<PackageCheck size={22} aria-hidden="true" />} title={t("supplier.shippingInfoTitle")} />
        <SectionIntro>
          {t("supplier.shippingIntro")}
        </SectionIntro>
        <div className={styles.shippingWorkbench}>
          <div className={styles.shippingFormPanel}>
            <div className={styles.shippingFormGrid}>
              {shippingPrimaryFields.map((item) => (
                <label key={item.label} className={styles.shippingField}>
                  <span>{item.displayLabel}</span>
                  <Input value={String(item.displayValue)} readOnly />
                  <small>{item.displayHelper}</small>
                </label>
              ))}
              {shippingNoteField ? (
                <label className={`${styles.shippingField} ${styles.shippingFieldWide}`}>
                  <span>{shippingNoteField.displayLabel}</span>
                  <Textarea value={String(shippingNoteField.displayValue)} rows={4} readOnly />
                  <small>{shippingNoteField.displayHelper}</small>
                </label>
              ) : null}
            </div>
            <div className={styles.shippingFormFooter}>
              <p>{isZh ? "待有可发货订单后提交物流信息。" : "Submit logistics information when an order is ready to ship."}</p>
              <Button type="button" size="sm" disabled>
                {t("common.submit")}
              </Button>
            </div>
          </div>

          <aside className={styles.submissionStatusPanel}>
            <span>{t("supplier.recentSubmissions")}</span>
            {supplierShippingSubmissions.length === 0 ? (
              <SupplierEmptyState
                title={noSubmissionsTitle}
                description={noSubmissionsDescription}
                compact
              />
            ) : (
              supplierShippingSubmissions.map((item) => (
                <article key={item.order}>
                  <strong>{item.order}</strong>
                  <em>{item.status}</em>
                  <p>{item.customer} · {item.detail}</p>
                </article>
              ))
            )}
          </aside>
        </div>
      </section>

      <OperationalSection
        icon={<BadgeCheck size={22} aria-hidden="true" />}
        title={t("supplier.processingNote")}
      >
        <div className={styles.boundaryList}>
          <p>{t("supplier.shippingNote1")}</p>
          <p>{t("supplier.shippingNote2")}</p>
          <p>{t("supplier.shippingNote3")}</p>
          <p>{t("supplier.shippingNote4")}</p>
        </div>
      </OperationalSection>
    </div>
  );
}

function renderLiveOps(t: TFunction) {
  return (
    <div className={styles.overviewMain}>
      <StatGrid items={supplierLiveOpsMetrics} />
      <OperationalSection
        icon={<Activity size={22} aria-hidden="true" />}
        title={t("supplier.liveOpsTitle")}
        description={t("supplier.liveOpsIntro")}
      >
        <div className={styles.liveOpsBoard}>
          <div className={styles.liveOpsLane}>
            <span>{t("supplier.aiWorkQueue")}</span>
            {supplierLiveOperations.map((item) => (
              <article key={item.id}>
                <strong>{item.title}</strong>
                <p>{item.summary}</p>
                <small>{item.nextSafeAction}</small>
              </article>
            ))}
          </div>
          <div className={styles.liveOpsLane}>
            <span>{t("supplier.liveEventStream")}</span>
            {supplierLiveOpsTimeline.map((item) => (
              <article key={`${item.time}-${item.title}`}>
                <strong>{item.time} · {item.state}</strong>
                <p>{item.title}</p>
                <small>{item.note}</small>
              </article>
            ))}
          </div>
        </div>
      </OperationalSection>
    </div>
  );
}

function renderAiEvolution(t: TFunction) {
  return (
    <div className={styles.overviewMain}>
      <OperationalSection
        icon={<LineChart size={22} aria-hidden="true" />}
        title={t("supplier.aiEvolutionTitle")}
        description={t("supplier.aiEvolutionIntro")}
      >
        <div className={styles.reportRows}>
          {supplierAiEvolutionReadiness.map((item) => (
            <div key={item.stage} className={styles.reportRow}>
              <span>{item.stage}</span>
              <strong>{item.value}</strong>
              <em>{item.note}</em>
            </div>
          ))}
        </div>
      </OperationalSection>

      <OperationalSection
        icon={<Bot size={22} aria-hidden="true" />}
        title={t("supplier.aiLab")}
        description={t("supplier.aiLabIntro")}
      >
        <div className={styles.operationGrid}>
          {supplierAiLabExperiments.map((item) => (
            <article key={item.label} className={styles.operationTile}>
              <span>{item.state}</span>
              <strong>{item.label}</strong>
              <p>{item.note}</p>
              <small>{item.value}</small>
            </article>
          ))}
        </div>
      </OperationalSection>
    </div>
  );
}

function renderWorkReport(t: TFunction) {
  return (
    <div className={styles.overviewMain}>
      <OperationalSection
        icon={<ClipboardCheck size={22} aria-hidden="true" />}
        title={t("supplier.workReportTitle")}
        description={t("supplier.workReportIntro")}
      >
        <div className={styles.reportPackageGrid}>
          {supplierReportPackages.map((item) => (
            <article key={item.period} className={styles.reportPackage}>
              <span>{item.period}</span>
              <strong>{item.summary}</strong>
              <ul>
                {item.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </OperationalSection>

      <OperationalSection
        icon={<Activity size={22} aria-hidden="true" />}
        title={t("supplier.periodSummary")}
      >
        <div className={styles.reportRows}>
          {supplierWorkReportRows.map((item) => (
            <div key={item.label} className={styles.reportRow}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <em>{item.note}</em>
            </div>
          ))}
        </div>
      </OperationalSection>
    </div>
  );
}

function renderAccountInfo(t: TFunction) {
  return (
    <OperationalSection
      icon={<UserRound size={22} aria-hidden="true" />}
      title={t("supplier.accountInfoTitle")}
      description={t("supplier.accountInfoIntro")}
    >
      <div className={styles.factGrid}>
        {supplierAccountProfile.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.helper}</small>
          </div>
        ))}
      </div>
    </OperationalSection>
  );
}

function renderAuthorization(
  t: TFunction,
  activeTodoId: string | null,
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void,
) {
  return (
    <div className={styles.overviewMain}>
      {renderTodoReturnBar(t, activeTodoId, onNavigate)}
      {activeTodoId === "SYN-TODO-QUOTE-APPROVAL" ||
      activeTodoId === "SYN-TODO-AUTHORIZATION-GAP"
        ? renderTodoProcessingPanel(t, activeTodoId, onNavigate)
        : null}
      <OperationalSection
        icon={<BadgeCheck size={22} aria-hidden="true" />}
        title={t("supplier.authorizationTitle")}
        description={t("supplier.authorizationIntro")}
      >
        <div className={styles.authorizationList}>
          {supplierAuthorizationItems.map((item) => (
            <article key={item.label}>
              <span>{item.label}</span>
              <strong>{item.status}</strong>
              <p>{item.impact}</p>
            </article>
          ))}
        </div>
        <div className={styles.todoLoopCallout}>
          <strong>{t("supplier.todoRelatedAuth")}</strong>
          <p>{t("supplier.todoRelatedAuthText")}</p>
        </div>
        <ReviewCard card={supplierReviewCards[0]} />
      </OperationalSection>
    </div>
  );
}

function renderDataAccess(
  t: TFunction,
  activeTodoId: string | null,
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void,
) {
  return (
    <div className={styles.overviewMain}>
      {renderTodoReturnBar(t, activeTodoId, onNavigate)}
      {activeTodoId === "SYN-TODO-PRODUCT-PARAMETER"
        ? renderTodoProcessingPanel(t, activeTodoId, onNavigate)
        : null}
      <OperationalSection
        icon={<FileText size={22} aria-hidden="true" />}
        title={t("supplier.dataAccessTitle")}
        description={t("supplier.dataAccessIntro")}
      >
        <div className={styles.dataAccessGrid}>
          {supplierDataAccessTypes.map((item) => (
            <button key={item.label} type="button">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.helper}</small>
            </button>
          ))}
        </div>
      </OperationalSection>

      <OperationalSection
        icon={<ClipboardCheck size={22} aria-hidden="true" />}
        title={t("supplier.submissionStatus")}
      >
        <div className={styles.submissionRows}>
          {supplierDataAccessSubmissions.map((item) => (
            <article key={item.label}>
              <strong>{item.label}</strong>
              <span>{item.status}</span>
              <p>{item.helper}</p>
            </article>
          ))}
        </div>
        <div className={styles.todoLoopCallout}>
          <strong>{t("supplier.todoReturnProduct")}</strong>
          <p>{t("supplier.todoReturnProductText")}</p>
        </div>
      </OperationalSection>

      <OperationalSection
        icon={<BadgeCheck size={22} aria-hidden="true" />}
        title={t("supplier.submissionNote")}
      >
        <div className={styles.boundaryList}>
          <p>{t("supplier.submissionNote1")}</p>
          <p>{t("supplier.submissionNote2")}</p>
          <p>{t("supplier.submissionNote3")}</p>
        </div>
      </OperationalSection>
    </div>
  );
}
