export type PolicyGateStatus =
  | "allowed"
  | "proposal_only"
  | "human_attention"
  | "blocked"
  | "hidden";

export type ActionTier =
  | "tier_0_explain"
  | "tier_1_draft"
  | "tier_2_candidate"
  | "tier_3_human_attention"
  | "tier_4_blocked";

export type CommandSurface = "supplier_command_inbox";

export type SurfaceSummary = {
  label: string;
  value: string;
  helper: string;
  policy_gate_status: PolicyGateStatus;
};

export type WorkItem = {
  id: string;
  title: string;
  owner: string;
  summary: string;
  evidence: string;
  nextSafeAction: string;
  policy_gate_status: PolicyGateStatus;
  action_tier: ActionTier;
};

export type ReviewCardData = {
  id: string;
  surface: CommandSurface;
  title: string;
  requiredReviewer: string;
  candidatePayload: string;
  evidenceSummary: string[];
  approvalBoundary: string;
  policy_gate_status: PolicyGateStatus;
  action_tier: Extract<ActionTier, "tier_3_human_attention">;
};

export type ChatMessage = {
  id: string;
  speaker: "supplier_owner" | "system";
  surface: CommandSurface;
  label: string;
  text: string;
  policy_gate_status: PolicyGateStatus;
  action_tier: ActionTier;
};

export const commandMachineFields = {
  shared: {
    baseline_origin: "1p0_read_only",
  },
  supplier: {
    source_surface_family: "supplier",
    optimization_mode: "command_inbox_projection",
    surface: "supplier_command_inbox",
  },
} as const;

export const supplierSummary: SurfaceSummary[] = [
  {
    label: "待处理",
    value: "6",
    helper: "待补信息、证据请求、负责人审批",
    policy_gate_status: "human_attention",
  },
  {
    label: "AI 工作中",
    value: "14",
    helper: "合成任务正在按安全下一步推进",
    policy_gate_status: "allowed",
  },
  {
    label: "机会提升",
    value: "+18%",
    helper: "基于证据摘要的机会提升",
    policy_gate_status: "allowed",
  },
];

export const supplierArchitectureBoundaries = [
  {
    label: "1.0 稳定基线",
    value: "只读继承",
    helper: "不改真实供应商后台，不替代现有后台。",
  },
  {
    label: "2.0 概念层",
    value: "隔离前端稿",
    helper: "AI 助理、待办、候选和审批卡片只用于设计证据。",
  },
  {
    label: "数据口径",
    value: "仅合成",
    helper: "不直连数据库、后端接口或真实订单数据。",
  },
  {
    label: "决策边界",
    value: "卡片审批",
    helper: "高风险动作进入独立审批卡片，对话不审批。",
  },
];

export const supplierNeedsYou: WorkItem[] = [
  {
    id: "SYN-SUP-NEED-001",
    title: "负责人审批授权候选",
    owner: "负责人",
    summary: "AI 已为一个合成客户分组准备授权调整候选。",
    evidence: "合成授权快照、合成客户需求摘要",
    nextSafeAction: "打开独立审批卡片，在对话外决策。",
    policy_gate_status: "human_attention",
    action_tier: "tier_3_human_attention",
  },
  {
    id: "SYN-SUP-NEED-002",
    title: "补充履约能力证据",
    owner: "协作人",
    summary: "合成履约说明缺少一份材料，补齐后 AI 才能继续准备候选。",
    evidence: "合成能力清单、合成履约时间线",
    nextSafeAction: "补充合成证据，或标记为暂不可用。",
    policy_gate_status: "proposal_only",
    action_tier: "tier_2_candidate",
  },
  {
    id: "SYN-SUP-NEED-003",
    title: "确认产品信息修正候选",
    owner: "协作人",
    summary: "AI 发现两处合成产品描述不一致，已准备修正候选。",
    evidence: "合成产品卡片、合成证据摘要",
    nextSafeAction: "查看修正候选；这里不会直接写入正式状态。",
    policy_gate_status: "proposal_only",
    action_tier: "tier_2_candidate",
  },
];

export const supplierLiveOperations: WorkItem[] = [
  {
    id: "SYN-SUP-AI-011",
    title: "客户机会进展更新",
    owner: "AI 工作队列",
    summary: "已基于合成上下文准备西班牙家居采购商的安全跟进候选。",
    evidence: "合成沟通摘要、合成价值证明变化",
    nextSafeAction: "提交负责人审批候选，不触发外部发送。",
    policy_gate_status: "proposal_only",
    action_tier: "tier_2_candidate",
  },
  {
    id: "SYN-SUP-AI-012",
    title: "价值证明摘要更新",
    owner: "AI 工作队列",
    summary: "已将合成证明点归类为客户可理解的业务结果。",
    evidence: "合成价值证明记录、合成订单历史摘要",
    nextSafeAction: "只展示您可见摘要。",
    policy_gate_status: "allowed",
    action_tier: "tier_1_draft",
  },
];

export const supplierLiveOpsMetrics = [
  {
    label: "今日推进",
    value: "14",
    helper: "AI 正在准备候选和摘要",
  },
  {
    label: "待人工确认",
    value: "6",
    helper: "负责人审批与协作人补材料",
  },
  {
    label: "安全下一步",
    value: "9",
    helper: "只准备，不执行外部动作",
  },
  {
    label: "已沉淀证据",
    value: "24",
    helper: "治理后的合成证据摘要",
  },
];

export const supplierLiveOpsTimeline = [
  {
    time: "09:20",
    title: "客户机会进展更新",
    state: "候选准备中",
    note: "AI 已整理沟通摘要，等待负责人决定是否进入报价候选。",
  },
  {
    time: "10:45",
    title: "订单履约证据检查",
    state: "待补材料",
    note: "2481 号订单缺少包装照片和预计发货时间。",
  },
  {
    time: "13:10",
    title: "授权缺口提示",
    state: "负责人审批",
    note: "授权缺口只生成审批卡片，不触发真实权限变更。",
  },
  {
    time: "15:30",
    title: "价值证明摘要更新",
    state: "已整理",
    note: "仅展示您可见的经营摘要，不展示内部诊断。",
  },
];

export const supplierOpportunityProgress = [
  {
    label: "机会数量",
    value: "18",
    helper: "您可见的合成客户机会",
  },
  {
    label: "阶段分布",
    value: "8 / 5 / 3 / 2",
    helper: "意向、报价、待补证据、负责人审批",
  },
  {
    label: "待补证据",
    value: "3",
    helper: "包装照片、发货窗口、产品描述修正",
  },
  {
    label: "负责人审批",
    value: "2",
    helper: "报价候选与授权缺口需要独立审批卡片",
  },
  {
    label: "已转订单",
    value: "6",
    helper: "已进入客户与订单摘要",
  },
  {
    label: "证据价值",
    value: "12 条",
    helper: "证据支持的客户进展摘要",
  },
  {
    label: "下一步动作",
    value: "补证据",
    helper: "对话可解释和准备候选，不直接执行",
  },
];

export const supplierValueProof = [
  "合成响应时间从 22 小时缩短到 9 小时",
  "合成报价完整度提升到 91%",
  "15 个机会中已有 12 个具备证据支撑",
];

export const supplierHomeTodos = [
  {
    id: "SYN-HOME-TODO-001",
    title: "确认德国客户报价候选",
    role: "负责人",
    summary: "AI 已整理证据与报价摘要，等待独立审批卡片决策。",
    priority: "高",
    targetPage: "authorization",
    destination: "去授权审批",
    closedLoopId: "SYN-TODO-QUOTE-APPROVAL",
  },
  {
    id: "SYN-HOME-TODO-002",
    title: "补充 2481 号包装照片",
    role: "协作人",
    summary: "履约证据缺少包装照片，补齐后 AI 可继续准备客户进展摘要。",
    priority: "中",
    targetPage: "shipping-info",
    destination: "去发货信息",
    closedLoopId: "SYN-TODO-PACKAGING-PHOTO",
  },
  {
    id: "SYN-HOME-TODO-003",
    title: "修正太阳能灯产品参数",
    role: "协作人",
    summary: "AI 发现两处合成产品描述不一致，已生成修正候选。",
    priority: "中",
    targetPage: "data-access",
    destination: "去资料与接入",
    closedLoopId: "SYN-TODO-PRODUCT-PARAMETER",
  },
  {
    id: "SYN-HOME-TODO-004",
    title: "确认本周授权缺口",
    role: "负责人",
    summary: "有 1 项负责人授权缺口影响 AI 后续准备候选材料。",
    priority: "高",
    targetPage: "authorization",
    destination: "去授权",
    closedLoopId: "SYN-TODO-AUTHORIZATION-GAP",
  },
  {
    id: "SYN-HOME-TODO-005",
    title: "补充客户机会证据",
    role: "负责人",
    summary: "西班牙家居采购商缺少阶段证据，需要补充后再推进下一步。",
    priority: "中",
    targetPage: "overview",
    destination: "去客户机会进展",
    closedLoopId: "SYN-TODO-OPPORTUNITY-EVIDENCE",
  },
];

export const supplierTodoSummaryMetrics = [
  {
    label: "全部待办",
    value: "12",
    helper: "本页展示 5 条闭环示例",
  },
  {
    label: "负责人确认",
    value: "4",
    helper: "报价、授权、风险候选",
  },
  {
    label: "协作人补充",
    value: "5",
    helper: "资料、凭证、参数说明",
  },
  {
    label: "已回流",
    value: "3",
    helper: "已同步到对应业务页",
  },
];

export type SupplierTodoClosedLoop = {
  id: string;
  title: string;
  category: string;
  role: string;
  priority: string;
  reason: string;
  aiPrepared: string;
  destinationLabel: string;
  destinationPage: string;
  relatedDestinationLabel?: string;
  relatedPage?: string;
  detailTitle: string;
  nextAction: string;
  closedLoop: string;
};

export const supplierTodoClosedLoops: SupplierTodoClosedLoop[] = [
  {
    id: "SYN-TODO-QUOTE-APPROVAL",
    title: "确认德国客户报价候选",
    category: "报价审批",
    role: "负责人",
    priority: "高",
    reason: "报价金额和授权边界触发负责人确认。",
    aiPrepared: "AI 已整理报价摘要、证据来源和风险提示。",
    destinationLabel: "设置 / 授权",
    destinationPage: "authorization",
    detailTitle: "报价候选与独立审批卡片",
    nextAction: "打开授权页，在独立审批卡片里决策。",
    closedLoop: "审批完成后，待办状态变为已处理；Chat 只负责解释和准备候选。",
  },
  {
    id: "SYN-TODO-PACKAGING-PHOTO",
    title: "补充 2481 号包装照片",
    category: "包装照片补充",
    role: "协作人",
    priority: "中",
    reason: "订单 2481 缺少包装照片，客户进展摘要无法继续整理。",
    aiPrepared: "AI 已定位订单、客户和缺失材料。",
    destinationLabel: "客户与订单 / 发货信息",
    destinationPage: "shipping-info",
    relatedDestinationLabel: "客户与订单 / 订单详情",
    relatedPage: "orders-detail",
    detailTitle: "发货信息提交与订单详情回流",
    nextAction: "在发货信息页补充凭证；订单详情显示等待后台确认。",
    closedLoop: "提交后进入人工确认，订单详情显示资料已提交 / 等待确认。",
  },
  {
    id: "SYN-TODO-PRODUCT-PARAMETER",
    title: "修正太阳能灯产品参数",
    category: "产品参数修正",
    role: "协作人",
    priority: "中",
    reason: "两个合成产品描述存在参数冲突。",
    aiPrepared: "AI 已标记冲突字段，并准备需要补充的资料说明。",
    destinationLabel: "设置 / 资料与接入",
    destinationPage: "data-access",
    relatedDestinationLabel: "客户与订单 / 订单详情",
    relatedPage: "orders-detail",
    detailTitle: "产品资料提交与订单关联",
    nextAction: "在资料与接入页提交产品资料或报价表说明。",
    closedLoop: "资料提交后由 Mekyro 团队整理，相关订单只展示关联状态。",
  },
  {
    id: "SYN-TODO-AUTHORIZATION-GAP",
    title: "确认本周授权缺口",
    category: "授权缺口",
    role: "负责人",
    priority: "高",
    reason: "一个授权缺口影响后续候选材料准备。",
    aiPrepared: "AI 已列出影响范围和需要负责人确认的事项。",
    destinationLabel: "设置 / 授权",
    destinationPage: "authorization",
    detailTitle: "授权状态与负责人确认",
    nextAction: "在授权页查看缺口，并通过独立审批入口处理。",
    closedLoop: "确认后，相关候选可进入下一步准备；不在 Chat 内完成审批。",
  },
  {
    id: "SYN-TODO-OPPORTUNITY-EVIDENCE",
    title: "补充客户机会证据",
    category: "客户机会补证据",
    role: "负责人",
    priority: "中",
    reason: "西班牙家居采购商缺少阶段证据，暂不适合推进转订单。",
    aiPrepared: "AI 已整理当前阶段、缺失证据和 next safe action。",
    destinationLabel: "总览 / 客户机会进展",
    destinationPage: "overview",
    detailTitle: "客户机会进展与证据缺口",
    nextAction: "在总览客户机会进展模块查看证据缺口和下一步。",
    closedLoop: "证据补齐后，机会进展模块更新；本轮不新增客户机会详情页。",
  },
];

export const supplierSalesHomeSummary = [
  {
    label: "新增客户",
    value: "8",
    helper: "本月新增客户线索",
  },
  {
    label: "沟通客户",
    value: "64",
    helper: "AI 已整理沟通摘要",
  },
  {
    label: "新增订单",
    value: "12",
    helper: "由客户机会转入履约",
  },
  {
    label: "成交收入",
    value: "¥486,000",
    helper: "仅为合成销售摘要",
  },
  {
    label: "客户转订单",
    value: "6",
    helper: "已进入履约跟进",
  },
];

export const supplierSalesHomeSignals = [
  {
    label: "客户机会转订单",
    value: "6",
    helper: "已进入履约跟进",
  },
  {
    label: "报价待确认",
    value: "2",
    helper: "需要负责人审批",
  },
  {
    label: "资料待补齐",
    value: "3",
    helper: "影响客户推进",
  },
];

export const supplierOverviewCockpitMetrics = [
  {
    label: "成交收入",
    value: "¥486,000",
    helper: "本月合成销售摘要",
  },
  {
    label: "新增客户",
    value: "8",
    helper: "本月新增客户线索",
  },
  {
    label: "沟通客户",
    value: "64",
    helper: "已整理沟通摘要",
  },
  {
    label: "新增订单",
    value: "12",
    helper: "客户机会转入履约",
  },
  {
    label: "风险提醒",
    value: "6",
    helper: "需负责人或协作人处理",
  },
];

export const supplierOverviewOrderHealth = [
  {
    label: "履约正常",
    value: "112 单",
    helper: "订单保持正常跟进",
  },
  {
    label: "发货待补",
    value: "3 单",
    helper: "去发货信息补充物流和凭证",
  },
  {
    label: "资料缺口",
    value: "9 单",
    helper: "影响订单推进节奏",
  },
  {
    label: "审批卡片",
    value: "2 项",
    helper: "报价和授权需负责人确认",
  },
];

export const supplierOverviewDataAccessStatus = [
  {
    label: "邮箱资料",
    value: "处理中",
    helper: "团队正在整理提交说明",
  },
  {
    label: "产品报价表",
    value: "需补充",
    helper: "补充币种、有效期和版本",
  },
  {
    label: "独立站表单",
    value: "已整理",
    helper: "已归入客户机会来源",
  },
  {
    label: "WhatsApp 资料",
    value: "可提交",
    helper: "用于客户沟通资料整理",
  },
];

export const supplierOverviewAiReadiness = [
  {
    label: "资料完整度",
    value: "82%",
    helper: "产品、履约、授权仍有缺口",
  },
  {
    label: "规则理解",
    value: "7 条",
    helper: "只展示您可见准备度",
  },
  {
    label: "证据摘要",
    value: "24 条",
    helper: "已治理为可读摘要",
  },
  {
    label: "下一步建议",
    value: "3 项",
    helper: "准备候选，不直接执行",
  },
];

export const supplierCustomerSummaryMetrics = [
  {
    label: "全部客户",
    value: "86",
    helper: "含未成单、机会和已成单客户",
  },
  {
    label: "未成单客户",
    value: "42",
    helper: "仍在沟通或资料整理中",
  },
  {
    label: "机会客户",
    value: "18",
    helper: "已形成明确需求或报价候选",
  },
  {
    label: "已成单客户",
    value: "26",
    helper: "已有订单进入履约",
  },
];

export const supplierCustomerRows = [
  {
    id: "customer-de-home",
    name: "德国日用品买家",
    source: "邮箱资料",
    stage: "报价前沟通",
    recentAction: "等待产品参数补充",
    orderState: "暂无订单",
  },
  {
    id: "customer-es-home",
    name: "西班牙家居采购商",
    source: "WhatsApp 沟通资料",
    stage: "机会推进",
    recentAction: "需要补充阶段证据",
    orderState: "未成单",
  },
  {
    id: "customer-us-retail",
    name: "北美零售客户",
    source: "独立站表单",
    stage: "已成单",
    recentAction: "包装照片待补充",
    orderState: "订单 2481",
  },
  {
    id: "customer-harbor",
    name: "港口用品采购商",
    source: "报价表",
    stage: "履约中",
    recentAction: "预计发货待确认",
    orderState: "订单 2604",
  },
];

export const supplierCustomerDetail = {
  id: "customer-de-home",
  name: "德国日用品买家",
  region: "德国",
  source: "邮箱资料",
  stage: "报价前沟通",
  lastContact: "今天 10:30",
  communicationSummary: "客户询问太阳能灯参数和阶梯报价，目前还没有形成订单。",
  nextAction: "补充产品参数和报价范围后，再准备报价候选。",
  relatedOrders: "暂无订单",
  orderNote: "未成单客户仍可展示客户详情，后续转订单后再关联订单汇总。",
  needs: [
    "关注点：太阳能灯续航、包装尺寸、最小起订量。",
    "报价意向：需要按 500 / 1000 / 3000 件分层准备。",
    "来源资料：邮箱沟通摘要和产品报价表。",
  ],
  missingInputs: [
    "太阳能灯最新参数",
    "报价表币种和有效期",
    "包装尺寸说明",
  ],
};

export const supplierOpportunityOrderLinks: Array<{ label: string; value: string; helper: string }> = [];

export const supplierOrderTimeRanges = [
  { label: "最近7天", labelEn: "Last 7 days" },
  { label: "本周", labelEn: "This week" },
  { label: "上周", labelEn: "Last week" },
  { label: "本月", labelEn: "This month" },
  { label: "上月", labelEn: "Last month" },
  { label: "今年至今", labelEn: "Year to date" },
];

export const supplierOrderSummaryMetrics = [
  { label: "订单总量", labelEn: "Total Orders", value: "0", helper: "暂无订单数据", helperEn: "No order data" },
  { label: "成交收入", labelEn: "Revenue", value: "¥0", helper: "暂无收入数据", helperEn: "No revenue data" },
  { label: "履约正常", labelEn: "On Track", value: "0", helper: "暂无履约数据", helperEn: "No fulfillment data" },
  { label: "需要补资料", labelEn: "Needs Info", value: "0", helper: "暂无待补资料", helperEn: "No pending items" },
];

export const supplierOrderRows: Array<{ id: string; customer: string; status: string; next: string; amount: string; owner: string }> = [];

export const supplierOrderDetail = {
  id: "—",
  customer: "—",
  amount: "¥0",
  status: "暂无数据",
  statusEn: "No data",
  opportunityLink: "—",
  customerSummary: "暂无订单数据。",
  customerSummaryEn: "No order data available.",
  product: "—",
  quantity: "0",
  summary: "第一版暂不提供订单详情，敬请期待。",
  summaryEn: "Order details not available in this version.",
  timeline: [] as Array<{ label: string; value: string; note: string }>,
  evidence: [] as string[],
  missingInputs: [] as string[],
};

export const supplierShippingInfoSummary = [
  { label: "待提交发货", labelEn: "Awaiting Shipment", value: "0", helper: "暂无发货数据", helperEn: "No shipping data" },
  { label: "后台处理中", labelEn: "Processing", value: "0", helper: "暂无处理中数据", helperEn: "No processing data" },
  { label: "已确认发货", labelEn: "Shipped", value: "0", helper: "暂无已发货数据", helperEn: "No shipped data" },
];

export const supplierShippingFormFields = [
  { label: "选择订单", labelEn: "Select Order", value: "暂无可用订单", valueEn: "No orders available", helper: "当前没有可发货的订单", helperEn: "No shippable orders" },
  { label: "第一段物流", labelEn: "First Leg", value: "—", helper: "暂无物流信息", helperEn: "No logistics info" },
  { label: "发货日期", labelEn: "Ship Date", value: "—", helper: "暂无发货日期", helperEn: "No ship date" },
  { label: "备注", labelEn: "Notes", value: "—", helper: "第一版暂不提供发货功能", helperEn: "Shipping not available in this version" },
];

export const supplierShippingSubmissions: Array<{ order: string; status: string; customer: string; detail: string }> = [];

export const supplierDataAccessTypes = [
  {
    label: "邮箱资料",
    value: "提交邮箱信息",
    helper: "只提交邮箱用途和联系说明，不填写邮箱密码。",
  },
  {
    label: "WhatsApp 客户沟通资料",
    value: "提交号码或截图说明",
    helper: "提交客户沟通截图、号码备注或整理说明。",
  },
  {
    label: "独立站 / 表单",
    value: "提交网址和表单说明",
    helper: "后台人工判断是否可整理成客户机会。",
  },
  {
    label: "产品资料 / 报价表",
    value: "提交文件或截图",
    helper: "用于人工整理产品、报价和证据候选。",
  },
  {
    label: "其他业务资料",
    value: "提交说明",
    helper: "由 Mekyro 团队人工判断处理方式。",
  },
];

export const supplierDataAccessSubmissions = [
  {
    label: "邮箱资料",
    status: "处理中",
    helper: "已提交邮箱用途说明，Mekyro 团队正在整理。",
  },
  {
    label: "产品报价表",
    status: "需要补充",
    helper: "需要补充币种、有效期和产品版本说明。",
  },
  {
    label: "独立站表单",
    status: "已完成",
    helper: "已人工整理为合成客户机会来源。",
  },
];

export const supplierAiEvolutionReadiness = [
  {
    stage: "资料完整度",
    value: "82%",
    note: "产品、履约、授权资料仍有合成缺口。",
  },
  {
    stage: "规则理解",
    value: "7 条候选",
    note: "仅展示您可见准备度，不展示知识图谱对话。",
  },
  {
    stage: "证据沉淀",
    value: "24 条摘要",
    note: "只显示已治理的证据摘要。",
  },
  {
    stage: "下一步建议",
    value: "3 项",
    note: "准备候选，不执行，不写正式状态。",
  },
];

export const supplierAiLabExperiments = [
  {
    label: "报价理解实验",
    state: "进行中",
    value: "7 条候选",
    note: "比较客户意图、历史报价和证据完整度，只产出候选。",
  },
  {
    label: "履约风险实验",
    state: "待补证据",
    value: "3 个缺口",
    note: "识别包装照片、发货窗口、产品描述一致性。",
  },
  {
    label: "价值证明实验",
    state: "可展示摘要",
    value: "12 条",
    note: "把合成证据转成您可理解的经营价值表达。",
  },
  {
    label: "授权边界实验",
    state: "需负责人",
    value: "2 项",
    note: "用于确认哪些候选必须进入独立审批卡片。",
  },
];

export const supplierWorkReportRows = [
  {
    label: "客户推进",
    value: "64 次沟通摘要",
    note: "AI 整理您可见的进展，不发送外部消息。",
  },
  {
    label: "订单推进",
    value: "128 单被跟进",
    note: "仅为合成订单摘要。",
  },
  {
    label: "AI 工作量",
    value: "46 个候选",
    note: "草稿、候选、审批提案，不代表执行。",
  },
  {
    label: "待供应商确认",
    value: "6 项",
    note: "负责人审批与协作人补证据分开呈现。",
  },
];

export const supplierReportPackages = [
  {
    period: "本周工作汇报",
    summary: "适合负责人快速看本周推进、风险和需要决策的事项。",
    highlights: [
      "新增客户线索 8 个，64 次沟通已整理成摘要。",
      "12 个新增订单进入履约视图，9 个需要补材料。",
      "2 个高风险候选等待负责人在独立卡片内审批。",
    ],
  },
  {
    period: "本月经营月报",
    summary: "适合月底复盘客户、订单、收入和 AI 候选质量。",
    highlights: [
      "成交收入 ¥486,000，仅为合成销售摘要。",
      "客户机会转订单 6 个，仍有 3 个待补证据。",
      "价值证明摘要 12 条，可用于后续展示与复盘。",
    ],
  },
];

export const supplierAccountProfile = [
  {
    label: "企业名称",
    value: "Mekyro 合成企业",
    helper: "合成展示资料",
  },
  {
    label: "账号数量",
    value: "1",
    helper: "第一版只保留一个账号",
  },
  {
    label: "当前角色",
    value: "负责人",
    helper: "仅为界面与合成表达",
  },
  {
    label: "资料完整度",
    value: "82%",
    helper: "产品与材料准备度",
  },
];

export const supplierAuthorizationItems = [
  {
    label: "报价候选审批",
    status: "需要负责人审批",
    impact: "影响高风险报价候选进入下一步。",
  },
  {
    label: "履约证据补充",
    status: "协作人可补充",
    impact: "允许补充合成证据，不触发真实履约变更。",
  },
  {
    label: "外部发送权限",
    status: "未连接",
    impact: "本轮不触发外部动作，不发送真实消息。",
  },
];

export const supplierReviewCards: ReviewCardData[] = [
  {
    id: "SYN-SUP-REV-001",
    surface: "supplier_command_inbox",
    title: "负责人授权候选",
    requiredReviewer: "负责人",
    candidatePayload: "面向北美零售客户分组的权限调整候选。",
    evidenceSummary: [
      "合成授权状态",
      "合成价值证明摘要",
      "策略状态需要人工关注",
    ],
    approvalBoundary:
      "对话可以解释和起草。审批必须在这个独立审批卡片内完成。",
    policy_gate_status: "human_attention",
    action_tier: "tier_3_human_attention",
  },
];

export const commandChatMessages: ChatMessage[] = [
  {
    id: "SYN-CHAT-001",
    speaker: "supplier_owner",
    surface: "supplier_command_inbox",
    label: "您",
    text: "解释一下，为什么这个合成授权更新在任何外部动作前都需要负责人审批。",
    policy_gate_status: "human_attention",
    action_tier: "tier_0_explain",
  },
  {
    id: "SYN-CHAT-002",
    speaker: "system",
    surface: "supplier_command_inbox",
    label: "AI助理",
    text: "它涉及负责人把关的权限。我可以整理证据并起草候选，但审批仍在独立审批卡片内完成。",
    policy_gate_status: "human_attention",
    action_tier: "tier_1_draft",
  },
];
