import {
  Activity,
  BadgeCheck,
  Bot,
  ClipboardCheck,
  FileText,
  LineChart,
  PackageCheck,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { CommandChatPanel } from "./command-chat-panel";
import styles from "./ai-native-command-workbench.module.css";
import { ReviewCard } from "./review-card";
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
  supplierOrderDetail,
  supplierOrderRows,
  supplierOrderSummaryMetrics,
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
  | "orders-summary"
  | "orders-detail"
  | "shipping-info"
  | "live-ops"
  | "ai-evolution"
  | "work-report"
  | "account-info"
  | "authorization"
  | "data-access";

type SupplierCommandSurfaceProps = {
  activePage: SupplierPageId;
  chatReturnPage: SupplierPageId;
  activeTodoId: string | null;
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void;
  onOpenChat: () => void;
};

function PageFooter() {
  return (
    <footer className={styles.pageFooter}>
      <span>2.0 概念 / 非生产</span>
      <span>仅合成数据</span>
      <span>无真实后台接入</span>
      <span>不进入公开导航</span>
      <span>审批不在对话内</span>
      <span>© Mekyro</span>
    </footer>
  );
}

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

function renderWithChatRail(
  content: ReactNode,
  onOpenChat: () => void,
) {
  return (
    <div className={styles.contentWithChat}>
      <div className={styles.contentMain}>{content}</div>
      <aside className={styles.chatRail} aria-label="页面右侧 Chat">
        <CommandChatPanel mode="rail" onOpenFullChat={onOpenChat} />
      </aside>
    </div>
  );
}

export function SupplierCommandSurface({
  activePage,
  chatReturnPage,
  activeTodoId,
  onNavigate,
  onOpenChat,
}: SupplierCommandSurfaceProps) {
  const [activeOrderRange, setActiveOrderRange] = useState("本月");

  return (
    <section className={styles.surfacePanel} data-active-page={activePage}>
      {activePage === "home" ? renderHome(onOpenChat, onNavigate) : null}
      {activePage === "todo-items" ? renderTodoItems(onNavigate, activeTodoId) : null}
      {activePage === "chat" ? renderChat(chatReturnPage, onNavigate) : null}
      {activePage === "overview"
        ? renderWithChatRail(renderOverview(activeTodoId, onNavigate), onOpenChat)
        : null}
      {activePage === "customer-summary"
        ? renderWithChatRail(renderCustomerSummary(onNavigate), onOpenChat)
        : null}
      {activePage === "customer-detail"
        ? renderWithChatRail(renderCustomerDetail(onNavigate), onOpenChat)
        : null}
      {activePage === "orders-summary"
        ? renderWithChatRail(
            renderOrdersSummary(onNavigate, activeOrderRange, setActiveOrderRange),
            onOpenChat,
          )
        : null}
      {activePage === "orders-detail"
        ? renderWithChatRail(renderOrdersDetail(activeTodoId, onNavigate), onOpenChat)
        : null}
      {activePage === "shipping-info" ? renderShippingInfo(activeTodoId, onNavigate) : null}
      {activePage === "live-ops" ? renderLiveOps() : null}
      {activePage === "ai-evolution" ? renderAiEvolution() : null}
      {activePage === "work-report" ? renderWorkReport() : null}
      {activePage === "account-info" ? renderAccountInfo() : null}
      {activePage === "authorization" ? renderAuthorization(activeTodoId, onNavigate) : null}
      {activePage === "data-access" ? renderDataAccess(activeTodoId, onNavigate) : null}
      <PageFooter />
    </section>
  );
}

function renderHome(
  onOpenChat: () => void,
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void,
) {
  return (
    <>
      <CommandChatPanel mode="entry" onOpenFullChat={onOpenChat} />
      <div className={styles.homeCards}>
        <section className={styles.whiteCard}>
          <CardTitle icon={<ClipboardCheck size={22} aria-hidden="true" />} title="待办事项" />
          <div className={styles.homeTodoList}>
            {supplierHomeTodos.map((todo, index) => (
              <button
                key={todo.id}
                type="button"
                className={styles.homeTodoItem}
                onClick={() => onNavigate("todo-items", { todoId: todo.closedLoopId })}
              >
                <span>{index + 1}</span>
                <strong>{todo.title}</strong>
                <small>{todo.destination.replace(/^去/, "")}</small>
                <em>›</em>
              </button>
            ))}
          </div>
          <div className={styles.cardFooterAction}>
            <button type="button" onClick={() => onNavigate("todo-items")}>
              查看全部待办
            </button>
          </div>
        </section>

        <section className={`${styles.whiteCard} ${styles.salesSummaryCard}`}>
          <CardTitle icon={<TrendingUp size={22} aria-hidden="true" />} title="销售数据摘要" />
          <div className={styles.homeSalesGrid}>
            {supplierSalesHomeSummary.map((item) => (
              <button key={item.label} type="button" className={styles.homeSalesMetric}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </button>
            ))}
          </div>
          <div className={styles.cardFooterAction}>
            <button type="button" onClick={() => onNavigate("overview")}>
              查看全部销售数据
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

function renderTodoItems(
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
        ← 返回首页
      </button>

      <section className={styles.whiteCard}>
        <CardTitle icon={<ClipboardCheck size={22} aria-hidden="true" />} title="待办事项" />
        <SectionIntro>
          这里展示待办从出现、判断、进入业务页面到状态回流的完整示例。待办页负责分流，真正处理仍发生在对应业务页面。
        </SectionIntro>
        <StatGrid items={supplierTodoSummaryMetrics} />
      </section>

      <section className={styles.whiteCard}>
        <CardTitle icon={<BadgeCheck size={22} aria-hidden="true" />} title="待办闭环示例" />
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
                <span>{todo.category} · {todo.role} · {todo.priority}优先级</span>
                <strong>{todo.title}</strong>
                <p>{todo.reason}</p>
                <div className={styles.todoStepList}>
                  <p>
                    <b>AI 已准备</b>
                    {todo.aiPrepared}
                  </p>
                  <p>
                    <b>处理页面</b>
                    {todo.destinationLabel}
                  </p>
                  <p>
                    <b>状态回流</b>
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
                  <span>去处理</span>
                  <strong>{todo.destinationLabel}</strong>
                </button>
                {todo.relatedPage ? (
                  <button
                    type="button"
                    onClick={() => onNavigate(todo.relatedPage as SupplierPageId, { todoId: todo.id })}
                  >
                    <span>查看关联</span>
                    <strong>{todo.relatedDestinationLabel}</strong>
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.whiteCard}>
        <CardTitle icon={<Bot size={22} aria-hidden="true" />} title="处理边界" />
        <div className={styles.boundaryList}>
          <p>待办事项只负责说明原因、准备材料和跳转处理页，不替代业务页面。</p>
          <p>Chat 可以解释待办和准备候选，但不能审批、执行或改写正式状态。</p>
          <p>所有示例仍是合成设计证据；真实后台、真实数据和真实接口不在本轮范围内。</p>
        </div>
      </section>
    </div>
  );
}

function renderChat(
  chatReturnPage: SupplierPageId,
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void,
) {
  return (
    <>
      <button
        type="button"
        className={styles.backButton}
        onClick={() => onNavigate(chatReturnPage === "chat" ? "home" : chatReturnPage)}
      >
        ← 返回上一页
      </button>
      <CommandChatPanel mode="full" />
    </>
  );
}

function getActiveTodo(todoId: string | null) {
  if (!todoId) return null;
  return supplierTodoClosedLoops.find((todo) => todo.id === todoId) ?? null;
}

function renderTodoReturnBar(
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
        ← 返回待办事项
      </button>
      <span>
        当前待办：<strong>{activeTodo.title}</strong>
      </span>
    </div>
  );
}

function renderTodoProcessingPanel(
  activeTodoId: string | null,
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void,
) {
  const activeTodo = getActiveTodo(activeTodoId);
  if (!activeTodo) return null;

  return (
    <section className={`${styles.whiteCard} ${styles.todoProcessingCard}`}>
      <CardTitle icon={<ClipboardCheck size={22} aria-hidden="true" />} title="当前待办处理" />
      <div className={styles.todoProcessingHeader}>
        <span>{activeTodo.category} · {activeTodo.role}</span>
        <strong>{activeTodo.title}</strong>
        <p>{activeTodo.reason}</p>
      </div>
      <div className={styles.todoProcessingGrid}>
        <article>
          <span>本页要做</span>
          <strong>{activeTodo.detailTitle}</strong>
          <p>{activeTodo.nextAction}</p>
        </article>
        <article>
          <span>AI 已准备</span>
          <strong>候选和证据摘要</strong>
          <p>{activeTodo.aiPrepared}</p>
        </article>
        <article>
          <span>完成后</span>
          <strong>状态回流</strong>
          <p>{activeTodo.closedLoop}</p>
        </article>
      </div>
      <div className={styles.todoProcessingActions}>
        <button
          type="button"
          onClick={() => onNavigate("todo-items", { todoId: activeTodo.id })}
        >
          返回待办事项
        </button>
        {activeTodo.relatedPage ? (
          <button
            type="button"
            onClick={() =>
              onNavigate(activeTodo.relatedPage as SupplierPageId, { todoId: activeTodo.id })
            }
          >
            查看关联页面
          </button>
        ) : null}
      </div>
    </section>
  );
}

function renderOverview(
  activeTodoId: string | null,
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void,
) {
  return (
    <div className={styles.overviewMain}>
      {renderTodoReturnBar(activeTodoId, onNavigate)}
      {activeTodoId === "SYN-TODO-OPPORTUNITY-EVIDENCE"
        ? renderTodoProcessingPanel(activeTodoId, onNavigate)
        : null}
      <section className={styles.whiteCard}>
        <CardTitle icon={<LineChart size={22} aria-hidden="true" />} title="经营驾驶舱" />
        <div className={styles.cockpitGrid}>
          {supplierOverviewCockpitMetrics.map((item) => (
            <article key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.helper}</small>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.whiteCard}>
        <CardTitle icon={<TrendingUp size={22} aria-hidden="true" />} title="客户机会进展" />
        <SectionIntro>
          总览保留完整客户机会模块；首页只做摘要，订单页只保留转化关联。
        </SectionIntro>
        <div className={styles.operationGrid}>
          {supplierOpportunityProgress.map((item) => (
            <article key={item.label} className={styles.operationTile}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <p>{item.helper}</p>
            </article>
          ))}
        </div>
        <div className={styles.todoLoopCallout}>
          <strong>客户机会补证据</strong>
          <p>西班牙家居采购商缺少阶段证据；补齐后更新机会进展，客户详情页只展示可见摘要。</p>
        </div>
      </section>

      <section className={styles.whiteCard}>
        <CardTitle icon={<PackageCheck size={22} aria-hidden="true" />} title="客户与订单健康" />
        <SectionIntro>
          总览只显示健康摘要和风险入口；完整客户与订单内容仍在客户与订单页面处理。
        </SectionIntro>
        <div className={styles.operationGrid}>
          {supplierOverviewOrderHealth.map((item) => (
            <article key={item.label} className={styles.operationTile}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <p>{item.helper}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.whiteCard}>
        <CardTitle icon={<FileText size={22} aria-hidden="true" />} title="资料与接入状态" />
        <SectionIntro>
          总览只看资料状态；邮箱、WhatsApp 客户沟通资料、独立站和报价表的处理仍在资料与接入页。
        </SectionIntro>
        <div className={styles.operationGrid}>
          {supplierOverviewDataAccessStatus.map((item) => (
            <article key={item.label} className={styles.operationTile}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <p>{item.helper}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.whiteCard}>
        <CardTitle icon={<Bot size={22} aria-hidden="true" />} title="AI 准备度" />
        <SectionIntro>
          这里只保留轻量准备度；实时工作队列进入实时运营大屏，周报和月报进入工作汇报。
        </SectionIntro>
        <div className={styles.operationGrid}>
          {supplierOverviewAiReadiness.map((item) => (
            <article key={item.label} className={styles.operationTile}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <p>{item.helper}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function renderOrdersSummary(
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void,
  activeOrderRange: string,
  setActiveOrderRange: (range: string) => void,
) {
  return (
    <div className={styles.overviewMain}>
      <section className={styles.whiteCard}>
        <CardTitle icon={<LineChart size={22} aria-hidden="true" />} title="订单汇总" />
        <div className={styles.timeFilter} aria-label="订单时间范围">
          {supplierOrderTimeRanges.map((range) => (
            <button
              key={range.label}
              type="button"
              aria-pressed={range.label === activeOrderRange}
              className={range.label === activeOrderRange ? styles.timeFilterActive : undefined}
              onClick={() => setActiveOrderRange(range.label)}
            >
              {range.label}
            </button>
          ))}
        </div>
        <div className={`${styles.cockpitGrid} ${styles.orderSummaryStats}`}>
          {supplierOrderSummaryMetrics.map((item) => (
            <article key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.helper}</small>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.whiteCard}>
        <CardTitle icon={<PackageCheck size={22} aria-hidden="true" />} title="订单列表" />
        <SectionIntro>
          这里只展示已成单订单，客户线索和未成单客户在客户汇总里查看。
        </SectionIntro>
        <div className={styles.orderSummaryList}>
          <div className={styles.orderSummaryHeader} aria-hidden="true">
            <span>订单</span>
            <span>客户</span>
            <span>状态</span>
            <span>下一步</span>
            <span>金额 / 负责人</span>
          </div>
          {supplierOrderRows.map((order) => (
            <button
              key={order.id}
              type="button"
              className={styles.orderSummaryRow}
              onClick={() => onNavigate("orders-detail")}
            >
              <strong>{order.id}</strong>
              <span>{order.customer}</span>
              <span>{order.status}</span>
              <span>{order.next}</span>
              <em>{order.amount} · {order.owner}</em>
            </button>
          ))}
        </div>
      </section>
      <section className={styles.whiteCard}>
        <CardTitle icon={<TrendingUp size={22} aria-hidden="true" />} title="客户机会关联" />
        <SectionIntro>
          这里只引用已转订单的来源机会，不重复完整客户机会进展模块。
        </SectionIntro>
        <div className={styles.orderLinkList}>
          {supplierOpportunityOrderLinks.map((item) => (
            <div key={item.label} className={styles.tableRow}>
              <strong>
                {item.label}
                <small>{item.value}</small>
              </strong>
              <span>{item.helper}</span>
              <em>关联</em>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function renderCustomerSummary(
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void,
) {
  return (
    <div className={styles.overviewMain}>
      <StatGrid items={supplierCustomerSummaryMetrics} />
      <section className={styles.whiteCard}>
        <CardTitle icon={<UserRound size={22} aria-hidden="true" />} title="客户汇总" />
        <SectionIntro>
          这里展示所有客户，包括未成单客户、机会客户和已成单客户；订单只在订单汇总里展开。
        </SectionIntro>
        <div className={styles.customerList}>
          <div className={styles.customerListHeader} aria-hidden="true">
            <span>客户</span>
            <span>来源</span>
            <span>阶段</span>
            <span>最近动作</span>
            <span>订单</span>
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
          <span>第 1 页 / 共 5 页 · 当前展示 1-20 / 86 个客户</span>
          <div>
            <button type="button" disabled>上一页</button>
            <button type="button">下一页</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function renderCustomerDetail(
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
          ← 返回客户汇总
        </button>
      </div>
      <section className={styles.whiteCard}>
        <CardTitle icon={<UserRound size={22} aria-hidden="true" />} title="客户详情" />
        <SectionIntro>
          这个示例展示未成单客户也可以进入详情页；订单为空时，仍保留沟通、需求和下一步。
        </SectionIntro>
        <div className={styles.customerDetailGrid}>
          <article>
            <span>客户名称</span>
            <strong>{supplierCustomerDetail.name}</strong>
            <p>{supplierCustomerDetail.region} · {supplierCustomerDetail.source}</p>
          </article>
          <article>
            <span>当前阶段</span>
            <strong>{supplierCustomerDetail.stage}</strong>
            <p>{supplierCustomerDetail.nextAction}</p>
          </article>
          <article>
            <span>最近沟通</span>
            <strong>{supplierCustomerDetail.lastContact}</strong>
            <p>{supplierCustomerDetail.communicationSummary}</p>
          </article>
          <article>
            <span>关联订单</span>
            <strong>{supplierCustomerDetail.relatedOrders}</strong>
            <p>{supplierCustomerDetail.orderNote}</p>
          </article>
        </div>
      </section>

      <section className={styles.whiteCard}>
        <CardTitle icon={<TrendingUp size={22} aria-hidden="true" />} title="需求与机会" />
        <div className={styles.detailStack}>
          {supplierCustomerDetail.needs.map((item) => (
            <p key={item}>{item}</p>
          ))}
          {supplierCustomerDetail.missingInputs.map((item) => (
            <p key={item}>待补：{item}</p>
          ))}
        </div>
        <div className={styles.cardFooterAction}>
          <button type="button" onClick={() => onNavigate("data-access")}>
            去资料与接入
          </button>
          <button type="button" onClick={() => onNavigate("orders-summary")}>
            查看订单汇总
          </button>
        </div>
      </section>
    </div>
  );
}

function renderOrdersDetail(
  activeTodoId: string | null,
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void,
) {
  return (
    <div className={styles.overviewMain}>
      {renderTodoReturnBar(activeTodoId, onNavigate)}
      {activeTodoId === "SYN-TODO-PACKAGING-PHOTO" ||
      activeTodoId === "SYN-TODO-PRODUCT-PARAMETER"
        ? renderTodoProcessingPanel(activeTodoId, onNavigate)
        : null}
      <div className={styles.orderDetailGrid}>
        <section className={styles.whiteCard}>
          <CardTitle icon={<PackageCheck size={22} aria-hidden="true" />} title="订单列表" />
          <SectionIntro>
            左侧选择订单，右侧查看当前订单明细；未成单客户在客户详情里查看。
          </SectionIntro>
          <div className={styles.orderList}>
            {supplierOrderRows.map((order) => (
              <button
                key={order.id}
                type="button"
                className={
                  order.id === supplierOrderDetail.id
                    ? styles.orderListItemActive
                    : styles.orderListItem
                }
              >
                <strong>
                  {order.id}
                  <small>{order.customer}</small>
                </strong>
                <span>{order.status}</span>
                <em>{order.amount}</em>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.whiteCard}>
          <CardTitle icon={<FileText size={22} aria-hidden="true" />} title="当前订单详情" />
          <div className={styles.orderDetailFacts}>
            <article>
              <span>客户</span>
              <strong>{supplierOrderDetail.customer}</strong>
              <p>{supplierOrderDetail.customerSummary}</p>
            </article>
            <article>
              <span>订单金额</span>
              <strong>{supplierOrderDetail.amount}</strong>
              <p>{supplierOrderDetail.status}</p>
            </article>
            <article>
              <span>产品与数量</span>
              <strong>{supplierOrderDetail.product}</strong>
              <p>{supplierOrderDetail.quantity}</p>
            </article>
            <article>
              <span>关联机会</span>
              <strong>{supplierOrderDetail.opportunityLink}</strong>
              <p>{supplierOrderDetail.summary}</p>
            </article>
          </div>
        </section>
      </div>

      <div className={styles.twoColumn}>
        <section className={styles.whiteCard}>
          <CardTitle icon={<Activity size={22} aria-hidden="true" />} title="履约时间线" />
          <div className={styles.timeline}>
            {supplierOrderDetail.timeline.map((item, index) => (
              <div key={item.label}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>
                  {item.label} · {item.value}
                  <small>{item.note}</small>
                </strong>
              </div>
            ))}
          </div>
        </section>
      <section className={styles.whiteCard}>
        <CardTitle icon={<ClipboardCheck size={22} aria-hidden="true" />} title="证据与待补信息" />
        <div className={styles.detailStack}>
          {supplierOrderDetail.evidence.map((item) => (
            <p key={item}>{item}</p>
          ))}
          {supplierOrderDetail.missingInputs.map((item) => (
            <p key={item}>待补：{item}</p>
          ))}
          <p>待办回流：包装照片提交后，这里显示资料已提交 / 等待后台确认。</p>
        </div>
      </section>
      </div>

      <section className={styles.whiteCard}>
        <CardTitle icon={<BadgeCheck size={22} aria-hidden="true" />} title="关键决策确认" />
        <SectionIntro>
          订单详情可以准备候选和证据；涉及金额、收款或履约变更时，请由负责人确认后再继续执行。
        </SectionIntro>
        <ReviewCard card={supplierReviewCards[0]} />
      </section>
    </div>
  );
}

function renderShippingInfo(
  activeTodoId: string | null,
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void,
) {
  return (
    <div className={styles.overviewMain}>
      {renderTodoReturnBar(activeTodoId, onNavigate)}
      {activeTodoId === "SYN-TODO-PACKAGING-PHOTO"
        ? renderTodoProcessingPanel(activeTodoId, onNavigate)
        : null}
      <StatGrid items={supplierShippingInfoSummary} />

      <section className={styles.whiteCard}>
        <CardTitle icon={<PackageCheck size={22} aria-hidden="true" />} title="发货信息" />
        <SectionIntro>
          这里用于快速提交多段物流、发货日期和发货凭证；提交后由 Mekyro 团队人工确认。
        </SectionIntro>
        <div className={styles.submissionLayout}>
          <div className={styles.submissionFormPreview}>
            {supplierShippingFormFields.map((item) => (
              <button key={item.label} type="button">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.helper}</small>
              </button>
            ))}
            <div className={styles.formActionRow}>
              <button type="button">提交</button>
            </div>
          </div>

          <div className={styles.submissionStatusPanel}>
            <span>最近提交</span>
            {supplierShippingSubmissions.map((item) => (
              <article key={item.order}>
                <strong>{item.order}</strong>
                <em>{item.status}</em>
                <p>{item.customer} · {item.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.whiteCard}>
        <CardTitle icon={<BadgeCheck size={22} aria-hidden="true" />} title="处理说明" />
        <div className={styles.boundaryList}>
          <p>发货仍由您完成，Mekyro 团队负责核对提交的信息。</p>
          <p>如果一票货有多段物流，可以分段补充承运商和单号。</p>
          <p>确认后，客户与订单页面会显示最新处理状态。</p>
          <p>待办回流：补充 2481 号包装照片完成后，订单详情显示等待后台确认。</p>
        </div>
      </section>
    </div>
  );
}

function renderLiveOps() {
  return (
    <div className={styles.overviewMain}>
      <StatGrid items={supplierLiveOpsMetrics} />
      <section className={styles.whiteCard}>
        <CardTitle icon={<Activity size={22} aria-hidden="true" />} title="实时运营大屏" />
        <SectionIntro>
          展示 AI 正在推进的您可见工作，不展示原始日志、内部技术诊断或内部路由。
        </SectionIntro>
        <div className={styles.liveOpsBoard}>
          <div className={styles.liveOpsLane}>
            <span>AI 工作队列</span>
            {supplierLiveOperations.map((item) => (
              <article key={item.id}>
                <strong>{item.title}</strong>
                <p>{item.summary}</p>
                <small>{item.nextSafeAction}</small>
              </article>
            ))}
          </div>
          <div className={styles.liveOpsLane}>
            <span>实时事件流</span>
            {supplierLiveOpsTimeline.map((item) => (
              <article key={`${item.time}-${item.title}`}>
                <strong>{item.time} · {item.state}</strong>
                <p>{item.title}</p>
                <small>{item.note}</small>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function renderAiEvolution() {
  return (
    <div className={styles.overviewMain}>
      <section className={styles.whiteCard}>
        <CardTitle icon={<LineChart size={22} aria-hidden="true" />} title="AI进化大屏" />
        <SectionIntro>
          用您能理解的方式展示 AI 准备度，不开放知识图谱对话。
        </SectionIntro>
        <div className={styles.reportRows}>
          {supplierAiEvolutionReadiness.map((item) => (
            <div key={item.stage} className={styles.reportRow}>
              <span>{item.stage}</span>
              <strong>{item.value}</strong>
              <em>{item.note}</em>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.whiteCard}>
        <CardTitle icon={<Bot size={22} aria-hidden="true" />} title="AI实验室" />
        <SectionIntro>
          实验室只展示合成实验的准备度和下一步候选，不开放知识图谱对话，也不代表真实运行。
        </SectionIntro>
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
      </section>
    </div>
  );
}

function renderWorkReport() {
  return (
    <div className={styles.overviewMain}>
      <section className={styles.whiteCard}>
        <CardTitle icon={<ClipboardCheck size={22} aria-hidden="true" />} title="工作汇报" />
        <SectionIntro>
          工作汇报面向人类负责人，按周报和月报组织，不暗示生产可用或实时运行。
        </SectionIntro>
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
      </section>

      <section className={styles.whiteCard}>
        <CardTitle icon={<Activity size={22} aria-hidden="true" />} title="本期摘要" />
        <div className={styles.reportRows}>
          {supplierWorkReportRows.map((item) => (
            <div key={item.label} className={styles.reportRow}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <em>{item.note}</em>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function renderAccountInfo() {
  return (
    <section className={styles.whiteCard}>
      <CardTitle icon={<UserRound size={22} aria-hidden="true" />} title="账号信息" />
      <SectionIntro>
        第一版假设每个企业只保留一个账号；账号管理暂不进入本轮。
      </SectionIntro>
      <div className={styles.factGrid}>
        {supplierAccountProfile.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.helper}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function renderAuthorization(
  activeTodoId: string | null,
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void,
) {
  return (
    <div className={styles.overviewMain}>
      {renderTodoReturnBar(activeTodoId, onNavigate)}
      {activeTodoId === "SYN-TODO-QUOTE-APPROVAL" ||
      activeTodoId === "SYN-TODO-AUTHORIZATION-GAP"
        ? renderTodoProcessingPanel(activeTodoId, onNavigate)
        : null}
      <section className={styles.whiteCard}>
        <CardTitle icon={<BadgeCheck size={22} aria-hidden="true" />} title="授权" />
        <SectionIntro>
          授权页只展示您可见的准备度和负责人审批入口，不展示凭证、令牌或外部原始数据。
        </SectionIntro>
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
          <strong>待办关联：报价确认 / 授权缺口</strong>
          <p>负责人确认报价候选和授权缺口；AI 助理只负责解释和准备候选。</p>
        </div>
        <ReviewCard card={supplierReviewCards[0]} />
      </section>
    </div>
  );
}

function renderDataAccess(
  activeTodoId: string | null,
  onNavigate: (page: SupplierPageId, options?: { todoId?: string | null }) => void,
) {
  return (
    <div className={styles.overviewMain}>
      {renderTodoReturnBar(activeTodoId, onNavigate)}
      {activeTodoId === "SYN-TODO-PRODUCT-PARAMETER"
        ? renderTodoProcessingPanel(activeTodoId, onNavigate)
        : null}
      <section className={styles.whiteCard}>
        <CardTitle icon={<FileText size={22} aria-hidden="true" />} title="资料与接入" />
        <SectionIntro>
          您可以在这里提交业务资料和接入需求，由 Mekyro 团队人工整理和跟进。
        </SectionIntro>
        <div className={styles.dataAccessGrid}>
          {supplierDataAccessTypes.map((item) => (
            <button key={item.label} type="button">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.helper}</small>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.whiteCard}>
        <CardTitle icon={<ClipboardCheck size={22} aria-hidden="true" />} title="提交状态" />
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
          <strong>待办回流：产品参数修正</strong>
          <p>太阳能灯参数补充后，Mekyro 团队整理为产品资料状态；订单页只展示关联提醒。</p>
        </div>
      </section>

      <section className={styles.whiteCard}>
        <CardTitle icon={<BadgeCheck size={22} aria-hidden="true" />} title="提交说明" />
        <div className={styles.boundaryList}>
          <p>请只提交业务资料和使用说明，不填写邮箱密码、验证码或私密账户信息。</p>
          <p>WhatsApp 只用于提交客户沟通资料，例如截图、号码备注或整理说明。</p>
          <p>Mekyro 团队整理后，会在这里更新处理状态。</p>
        </div>
      </section>
    </div>
  );
}
