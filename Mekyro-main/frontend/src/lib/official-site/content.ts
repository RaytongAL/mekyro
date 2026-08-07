export type OfficialLocale = "zh-CN" | "en-US";
export type OfficialViewportMode = "auto" | "desktop" | "mobile";

export type OfficialPage = "home" | "about" | "aboutContact" | "login" | "opsEntry" | "contact" | "contactBuyer" | "security" | "pricing" | "faq";

export type OfficialSearchParams = Record<string, string | string[] | undefined>;

export const officialLocales: OfficialLocale[] = ["zh-CN", "en-US"];

export function isOfficialLocale(value: unknown): value is OfficialLocale {
  return value === "zh-CN" || value === "en-US";
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function resolveOfficialLocale(params: OfficialSearchParams | undefined): OfficialLocale {
  const locale = firstParam(params?.locale);
  return isOfficialLocale(locale) ? locale : "zh-CN";
}

export function resolveOfficialViewportMode(params: OfficialSearchParams | undefined): OfficialViewportMode {
  const view = firstParam(params?.view);
  return view === "mobile" || view === "desktop" ? view : "auto";
}

export const officialCopy = {
  "zh-CN": {
    localeName: "中文",
    alternateLocaleName: "EN",
    nav: {
      home: "首页",
      about: "关于我们",
      aboutOverview: "了解 Mekyro",
      contactUs: "联系我们",
      product: "关于产品",
      security: "关于我们",
      pricing: "服务费用",
      faq: "常见问题",
      contactMenu: "联系我们",
      contactSupplier: "我是供应商",
      contactBuyer: "我是买家",
      contact: "申请托管",
      login: "供应商后台",
    },
    common: {
      brand: "Mekyro",
      primaryCta: "申请托管",
      secondaryCta: "了解 Mekyro",
      loginCta: "供应商后台说明",
      backHome: "回到首页",
      languageLabel: "语言",
    },
    home: {
      title: "让 AI 去完成交易闭环",
      subtitle: "",
      lead:
        "AI原生营销智能体 全自动化成交引擎\n面向制造商和贸易商的B2B销售需求，从寻找客资、发现销售线索到建立联系\n探寻需求，直到完成收款、再次复购，全部由AI自主完成",
      actions: {
        primary: "申请托管",
        secondary: "查看产品演示",
        login: "",
      },
      proof: ["几乎全流程自动推进", "销售经验持续沉淀", "高风险动作受控确认"],
      previewTitle: "为制造商和贸易商打造的AI全自动化流程",
      previewRows: [
        ["感知环境并寻找客户", "了解供应商与市场，寻找目标客户"],
        ["开发客户并深入沟通", "深度了解客户的需求，并判断下一步动作"],
        ["达成交易、处理售后", "调用 Skill、知识图谱等各种工具去达成交易"],
        ["沉淀知识并形成复购", "把结果写回客户知识和运营状态，让复购成为常态"],
      ],
      painsTitle: "传统销售运营面临哪些挑战",
      painsLead: "",
      pains: [
        ["转化率低", "线索进入后缺少连续跟进，报价、解释、催付和复购之间经常断开。"],
        ["销售人员流失", "客户语境、报价习惯和历史承诺跟着员工离开，团队反复从零开始。"],
        ["时差导致订单流失", "客户发来关键问题时无人响应，第二天再跟进已经失去最佳窗口。"],
        ["沟通壁垒", "Email、WhatsApp、语言、文化和交易术语混在一起，人工很难稳定处理。"],
        ["管理不可见", "负责人只能看结果，很难看见每个客户为什么卡住、下一步谁该行动。"],
        ["经验不复利", "成功话术、失败原因、价格边界和交付风险没有自动沉淀成下一次动作。"],
      ],
      processTitle: "而是一台永不休眠的自动化成交引擎",
      processLead: "",
      processRows: [
        ["感知客户", "了解市场，积累行业经验，寻找有效客户并建联。"],
        ["规划动作", "判断客户意图、交易阶段、风险等级和计划。"],
        ["自动执行", "通过智能体生成回复、准备报价、更新状态、触发内部提醒。"],
        ["验证成果", "售后、退款、授权和敏感承诺进人工审核。"],
        ["沉淀知识", "把每次沟通、订单变化和失败原因编译进可复用客户知识。"],
        ["及时汇报", "人类只看到需要确认的高信号事项，而不是原始信息洪流。"],
      ],
      projectionTitle: "人类是整个系统的监督者和受益者",
      projectionRows: [
        ["监督整个系统", "通过系统与业务大屏，看到 AI 正在推进什么、哪些动作需要授权、哪些客户正在变热。"],
        ["接收汇报", "接收 AI 的日报、周报、关键事件汇报，全面掌握项目情况。"],
        ["处理风险事件", "处理超出授权的申请、异常订单处理、异常物流处理等。"],
      ],
      qaTitle: "供应商常见问题",
      qaRows: [
        ["Mekyro 会替代现有销售团队吗？", "第一阶段更像托管运营层：AI 承担高频重复与跨时区推进，人类保留授权、策略和关键关系。"],
        ["AI 可以自动完成所有承诺吗？", "日常动作尽量自动完成；价格、付款、退款、库存和合同等高风险承诺需要策略门或人工确认。"],
        ["必须先是外贸团队才能使用吗？", "不是。第一批场景会优先覆盖跨语言、跨时区、高沟通密度的交易团队，但产品定位不锁死某个行业。"],
      ],
      boundaryTitle: "官网不是业务系统本体",
      boundaryText:
        "官网负责讲清 Mekyro 的入口、信任模型和合作边界；真实交易、支付、账号开通和系统接入会在授权后进入对应后台流程。",
    },
    about: {
      title: "关于 Mekyro",
      eyebrow: "关于我们",
      lead:
        "Mekyro 是面向 B2B 交易团队的成交运营系统。我们希望把分散在询盘、邮件、WhatsApp、报价和订单里的上下文重新接起来，让团队在长周期交易里保持稳定、清楚、可追踪。",
      sections: [
        {
          title: "我们为什么做 Mekyro",
          paragraphs: [
            "在很多制造商和贸易商的日常里，成交不是一次漂亮回复，而是一段反复确认、持续跟进、不断补齐信息的关系。客户可能今天从官网询价，明天在 WhatsApp 追问，几周后才进入报价和付款；每一次沟通都会影响下一步判断。",
            "问题在于，这些信息常常散落在不同的人、不同渠道和不同表格里。团队忙的时候，客户上下文会断，报价习惯会丢，过去答应过什么也需要反复翻找。Mekyro 想解决的就是这个基础但重要的问题：让交易过程被连续地记录、推进和复用。",
          ],
        },
        {
          title: "我们做的事情",
          paragraphs: [
            "我们把客户沟通、报价准备、订单跟进和知识沉淀放进同一个工作流。销售团队不需要在多个系统之间反复整理信息，也不需要靠个人记忆维持每个客户的状态。",
            "系统会帮助团队看清客户当前处在哪个阶段、下一步应该做什么、哪些事项需要确认。真正涉及价格、付款、退款、授权和敏感承诺的部分，仍然交给人来判断。",
          ],
        },
        {
          title: "我们服务的团队",
          paragraphs: [
            "我们优先服务跨语言、跨时区、高沟通密度的 B2B 团队，尤其是制造商、贸易商和需要长期跟进复购的销售组织。",
            "这类团队往往不缺产品，也不缺努力；更需要的是一种稳定的经营底座，让每一次沟通都能留下上下文，让团队经验不只停留在个人脑子里。",
          ],
        },
        {
          title: "我们相信的边界",
          paragraphs: [
            "Mekyro 不是为了替代人的判断。我们希望系统先把重复、分散、容易遗漏的工作接住，让人把精力放在客户关系、关键承诺和业务策略上。",
            "好的自动化不应该制造失控感。它应该让每一步更清楚：谁说过什么，下一步是什么，哪些地方必须人工确认，哪些经验可以在下一次交易里继续使用。",
          ],
        },
      ],
      modelKicker: "交易现场",
      modelTitle: "我们从真实交易现场出发",
      modelLead: "制造商和贸易商最难的往往不是某一次回复，而是跨时区、跨语言、跨团队地保持连续。",
      modelRows: [
        ["客户问题不能散落", "询盘、邮件、WhatsApp 和订单状态需要回到同一个上下文。"],
        ["销售经验不能只在个人脑子里", "报价习惯、客户偏好和失败原因应该变成团队可复用的资产。"],
        ["关键承诺不能失控", "价格、付款、退款、授权和敏感承诺必须清楚地交给人确认。"],
      ],
      storyKicker: "我们在解决什么",
      storyTitle: "B2B 成交不是一次回复，而是一段持续推进的关系",
      rows: [
        ["我们为什么做 Mekyro", "很多制造商和贸易商并不缺产品，也不缺努力。真正难的是在长周期交易里保持稳定响应，把每个客户的上下文、承诺和下一步动作持续接住。"],
        ["我们怎么做", "Mekyro 把沟通、报价、订单跟进和知识沉淀放进同一个工作流，让团队少做重复整理，多处理真正需要判断的事情。"],
        ["我们服务谁", "我们优先服务跨语言、跨时区、高沟通密度的 B2B 团队，尤其是需要长期跟进、复购经营和多人协作的交易场景。"],
      ],
      principlesTitle: "我们如何建设产品",
      principles: [
        ["让业务先连续", "系统的价值不是多一个面板，而是让日常跟进、报价准备和订单状态在同一条线上稳定前进。"],
        ["让人处理关键判断", "团队应该看到需要确认、授权和介入的事项，而不是被所有原始消息淹没。"],
        ["让经验留下来", "每一次沟通、报价、订单变化和失败原因，都应该沉淀成下一次可复用的业务知识。"],
        ["把边界写清楚", "价格、付款、退款、授权、敏感承诺和客户数据必须有清晰的权限与人工确认规则。"],
      ],
      ctaTitle: "从一段真实销售流程开始",
      ctaText: "如果你想了解 Mekyro 是否适合你的交易流程，可以先从一段真实销售流程开始。",
      boundaryTitle: "官网承载什么",
      boundaryRows: [
        ["品牌认知", "讲清 Mekyro 是什么、适合谁、解决什么运营断点。"],
        ["供应商申请", "让供应商整理托管合作意向，具体提交与对接由 Mekyro 团队确认。"],
        ["买家询价", "保留公开询价入口，但买家不登录，后续通过安全链接进入交易上下文。"],
        ["供应商后台入口", "提供供应商后台登录，正式账号开通由合作流程确认。"],
      ],
    },
    aboutContact: {
      title: "联系我们",
      heading: "很高兴与你沟通",
      lead: "欢迎您通过各种通讯方式以及来访与我们沟通，我们将在第一时间回复您",
      imageAlt: "Mekyro 联系我们视觉",
      cards: [
        ["办公时间", "周一至周五 9:30 - 18:30", "中国标准时间，节假日除外。"],
        ["上海办公室", "中国 · 上海", "虹桥展汇国际 6 号楼 9 楼"],
        ["深圳办公室", "中国 · 深圳", "田面国际文创中心 T10"],
        ["联系方式", "info@mangkeyi.com", "86-21-54313979"],
      ],
    },
    login: {
      title: "供应商后台登录",
      lead:
        "这里仅保留供应商后台登录。买家不登录，也不展示其他后台入口。",
      demoNotice: "",
      tabPassword: "密码登录",
      tabSms: "短信登录",
      tabEmail: "邮箱登录",
      supplier: {
        title: "供应商后台登录",
        text: "使用供应商账号进入后台，查看 AI 正在推进的客户、待确认动作、订单状态、运营报告和授权边界。",
        accountLabel: "用户名",
        accountPlaceholder: "请输入用户名",
        passwordLabel: "密码",
        passwordPlaceholder: "请输入密码",
        cta: "进入供应商后台",
        hint: "使用已开通的供应商账号登录。",
        smsPhoneLabel: "手机号",
        smsPhonePlaceholder: "请输入手机号",
        smsCta: "进入供应商后台",
        smsHint: "输入已开通供应商账号绑定的手机号，接收短信验证码登录。",
        emailLabel: "邮箱",
        emailPlaceholder: "请输入邮箱地址",
        emailCta: "进入供应商后台",
        emailHint: "输入已开通供应商账号绑定的邮箱，接收验证码登录。",
      },
      showcase: {
        title: "供应商工作台预览",
        text: "无需登录，直接浏览供应商 AI 工作台的交互原型和功能演示。",
        cta: "查看演示",
        hint: "展示用途，数据为模拟数据。",
      },
      demos: [
        { title: "供应商平台演示", text: "浏览供应商 AI 工作台的完整功能原型。", cta: "查看旧版本供应商演示", href: "/old/supplier" },
        { title: "AI 套件演示", text: "浏览 AI 命令实验室的交互演示。", cta: "查看新版本供应商演示", href: "/old/ai-native-command-lab" },
        { title: "运营平台演示", text: "浏览内部运营后台的供应商管理、Agent 运行和策略审计功能。", cta: "查看运营后台演示", href: "/old/ops" },
      ],
      proofRows: [
        ["供应商入口", "只用于供应商后台登录，不承载其他后台入口。"],
        ["买家不登录", "买家公开询价在 /contact/buyer，后续通过 Quote / Payment / Order / Track / Reorder 安全链接继续。"],
        ["登录行为", "登录成功后进入供应商工作台。"],
      ],
    },
    opsEntry: {
      title: "内部运营入口",
      lead:
        "这是 Mekyro 内部团队专用登录入口，不出现在官网导航、页脚、供应商登录页或公开 CTA 中。",
      demoNotice: "内部账号登录后进入运营后台；本入口只供内部团队使用。",
      ops: {
        title: "内部运营后台登录",
        text: "内部团队查看供应商、Agent 运行视图、异常队列、安全策略和平台运营状态。",
        accountLabel: "用户名",
        accountPlaceholder: "请输入用户名",
        passwordLabel: "密码",
        passwordPlaceholder: "请输入密码",
        cta: "进入内部运营后台",
        hint: "内部入口不出现在公开官网信息架构中。",
      },
      proofRows: [
        ["非公开入口", "不出现在官网导航、页脚、供应商后台入口或公开 CTA。"],
        ["登录行为", "登录成功后进入内部运营后台。"],
        ["权限边界", "真实权限、外部系统和敏感操作由对应后台服务控制。"],
      ],
    },
    contact: {
      title: "我是供应商",
      lead: "",
      supplierTitle: "我是供应商",
      supplierSubtitle: "申请 Mekyro 托管销售运营",
      supplierLead: "告诉我们你的业务、客户来源和最希望 AI 先托管的工作，方便后续快速确认合作范围。",
      fields: [
        "公司名称",
        "主营业务或产品",
        "所在国家",
        "联系人姓名",
        "手机号码",
        "邮箱",
        "备注说明",
      ],
      buyerTitle: "我是买家",
      buyerPageTitle: "我是买家",
      buyerPageLead: "",
      buyerSubtitle: "提交采购需求",
      buyerLead:
        "买家提交需求后，Mekyro 会通过授权后的安全交易上下文继续提供报价、付款、订单、物流追踪和复购；买家无需创建账号。",
      buyerFields: [
        "公司名称",
        "需求产品",
        "所在国家",
        "联系人姓名",
        "手机号码",
        "邮箱",
        "备注说明",
      ],
      pipelineTitle: "提交后应该发生什么",
      pipelineRows: [
        ["确认范围", "先判断是否适合托管式自动化运营，而不是直接售卖复杂套餐。"],
        ["梳理入口", "确认现有 Email、WhatsApp、表单、API 或订单系统可以提供哪些上下文。"],
        ["建立边界", "定义 AI 可自动执行的动作、必须确认的动作和敏感数据规则。"],
      ],
      qaTitle: "合作前常见问题",
      qaRows: [
        ["提交后会发生什么？", "当前页面用于梳理合作信息；正式提交与对接会由 Mekyro 团队确认。"],
        ["需要准备完整系统接口吗？", "不需要一开始就完整接入。先确认托管范围，再决定 Email、WhatsApp、API 或 VM 的接入顺序。"],
      ],
      stubNotice: "提交后 Mekyro 团队会尽快与您联系确认合作范围。",
      buyerStubNotice: "提交后 Mekyro 团队会尽快与您联系确认采购需求。",
      cta: "提交合作申请",
      buyerCta: "提交采购需求",
    },
    security: {
      title: "安全、权限与 AI 边界",
      lead:
        "Mekyro 的信任基础不是让 AI 无限制行动，而是让 AI 在明确授权、策略门和数据隔离下自动运行。",
      rows: [
        ["独立工作空间", "不同客户的数据、买家交易上下文、授权设置、交易记录和运营报告默认隔离。"],
        ["权限边界", "官网只描述入口。真实授权由已登录工作空间和后台权限规则执行，前端菜单不等于安全控制。"],
        ["AI 自动化边界", "AI 可以准备建议、运行 Skill、整理 Email、引用证据并推进任务；高风险承诺需要策略门。"],
        ["敏感数据处理", "Token、API 密钥、VM 凭据、支付信息和私有知识不进入官网页面，也不写入公开文案。"],
        ["人工介入边界", "人类处理高风险例外、授权变更和合作确认，不把日常运营重新变成人工流水线。"],
      ],
      automationTitle: "AI 可以自动做什么",
      automationRows: [
        ["低风险动作", "整理线索、生成回复草稿、更新状态、提醒下一步、沉淀知识。"],
        ["受控动作", "报价、库存、交付承诺、付款与退款进入策略门或人工确认。"],
        ["禁止动作", "未经授权读取敏感凭据、绕过权限、伪造支付结果或替人签署不可逆承诺。"],
      ],
      buyerTitle: "买家常见问题",
      buyerRows: [
        ["买家需要账号吗？", "不需要。买家通过授权后的安全交易上下文继续沟通，不在官网创建账号。"],
        ["买家的信息会被多个客户共用吗？", "不会作为公开信息展示。买家上下文属于对应交易和授权范围。"],
      ],
    },
    pricing: {
      title: "年费 29,800 元",
      lead: "",
      rows: [
        ["限时折扣价", "年费 29,800 元人民币，原价 98,000 元人民币。"],
        ["覆盖启动配置", "包含 onboarding、产品与知识初始化、工作空间配置、基础配置和托管服务。"],
        ["覆盖持续运营", "包含 AI 销售推进、付款履约跟进、复购动作提醒和持续知识沉淀。"],
      ],
      valueTitle: "费用对应的是持续运营能力",
      valueRows: [
        ["获客到转化", "不是只展示页面，而是让 AI 持续推进客户从线索到确认。"],
        ["交易到复购", "不是只记录订单，而是持续跟进付款、履约、追踪和复购。"],
        ["经验到系统", "不是只依赖个人经验，而是把每次成功和失败沉淀为下一次动作。"],
      ],
      qaTitle: "价格常见问题",
      qaRows: [
        ["当前官网展示的价格是多少？", "当前展示为限时折扣价 29,800 元人民币/年，原价 98,000 元人民币/年。"],
        ["是否会做复杂套餐？", "当前不做复杂套餐。官网只表达年费托管服务方案。"],
      ],
    },
    faq: {
      title: "常见问题",
      lead: "",
      supplierTitle: "供应商常见问题",
      buyerTitle: "买家常见问题",
      cooperationTitle: "合作与费用",
    },
  },
  "en-US": {
    localeName: "English",
    alternateLocaleName: "中文",
    nav: {
      home: "Home",
      about: "About",
      aboutOverview: "About Mekyro",
      contactUs: "Contact us",
      product: "Product",
      security: "About",
      pricing: "Pricing",
      faq: "FAQ",
      contactMenu: "Contact",
      contactSupplier: "I am a supplier",
      contactBuyer: "I am a buyer",
      contact: "Managed service",
      login: "Supplier portal",
    },
    common: {
      brand: "Mekyro",
      primaryCta: "Apply for managed service",
      secondaryCta: "About Mekyro",
      loginCta: "Supplier portal note",
      backHome: "Back home",
      languageLabel: "Language",
    },
    home: {
      title: "Let AI truly complete the deal",
      subtitle: "",
      lead:
        "AI-native marketing agent Fully automated deal engine\nFrom finding leads and reaching out to qualifying needs, quoting, collecting payment, and driving repeat purchase, AI runs the workflow end to end.",
      actions: {
        primary: "Apply for managed service",
        secondary: "View product demo",
        login: "",
      },
      proof: ["Near end-to-end automation", "Sales knowledge keeps compounding", "High-risk actions stay governed"],
      previewTitle: "AI automated deal operating flow",
      previewRows: [
        ["Sense the market and find customers", "Understand suppliers and market context, then find target customers"],
        ["Connect and communicate deeply", "Understand customer needs in depth and decide the next action"],
        ["Close transactions", "Use Skill, knowledge graph, and business tools to close deals"],
        ["Compound knowledge and reorder", "Write outcomes back into customer knowledge and operating state so reorder becomes routine"],
      ],
      painsTitle: "What challenges do traditional sales operations face",
      painsLead: "",
      pains: [
        ["Low conversion", "Leads enter the funnel, then quote handling, explanation, payment nudges, and reorder follow-up disconnect."],
        ["Sales churn", "Customer context, pricing habits, and historical commitments leave with individual salespeople."],
        ["Time-zone loss", "A buyer asks a decisive question while the team is offline; by the next day, the window has often closed."],
        ["Communication barriers", "Email, WhatsApp, language, culture, and transaction terminology are hard for humans to process consistently."],
        ["Low management visibility", "Leaders see outcomes, but not why a customer is stuck or which next action matters."],
        ["No compounding memory", "Winning scripts, loss reasons, pricing boundaries, and delivery risks do not automatically become the next best action."],
      ],
      processTitle: "It is an always-on automated deal engine.",
      processLead: "",
      processRows: [
        ["Sense customers", "Read context from Email, WhatsApp, forms, and authorized transaction events."],
        ["Plan action", "Judge intent, transaction stage, risk level, and the smallest useful next move."],
        ["Execute automatically", "Use Agent and Skill workflows to draft replies, prepare quotes, update state, and raise internal attention."],
        ["Verify boundaries", "Price, inventory, payment, refund, authorization, and sensitive commitments go through policy gates or human confirmation."],
        ["Compile knowledge", "Turn each conversation, order change, and failure reason into reusable customer knowledge."],
        ["Show clear signals", "Humans see high-signal decisions instead of raw information flood."],
      ],
      projectionTitle: "Humans supervise and benefit from the whole system",
      projectionRows: [
        ["Supervise the system", "Use system and business dashboards to see what AI is moving, which actions require authorization, and which customers are getting warmer."],
        ["Receive reports", "Receive AI daily reports, weekly reports, and key-event updates to understand project status end to end."],
        ["Handle risk events", "Handle requests beyond authorization, abnormal orders, abnormal logistics, and similar exceptions."],
      ],
      qaTitle: "Supplier questions",
      qaRows: [
        ["Does Mekyro replace the existing sales team?", "In the first phase it works as a managed operating layer: AI handles repetitive and cross-time-zone work, while humans retain authorization, strategy, and key relationships."],
        ["Can AI make every commitment automatically?", "Routine work should be automated as much as possible; price, payment, refund, inventory, and contract commitments require policy gates or human confirmation."],
        ["Is this only for foreign trade teams?", "No. The first scenarios prioritize cross-language, cross-time-zone, high-communication transactions, but the product is not locked to one industry."],
      ],
      boundaryTitle: "The official site is not the business system itself",
      boundaryText:
        "The site explains Mekyro's entry points, trust model, and cooperation boundaries. Transactions, payments, account provisioning, and system connections move through the right backend flows after authorization.",
    },
    about: {
      title: "About Mekyro",
      eyebrow: "About us",
      lead:
        "Mekyro is a deal operating system for B2B teams. We reconnect the context scattered across inquiries, email, WhatsApp, quoting, and orders, so long-cycle transactions stay steady, clear, and traceable.",
      sections: [
        {
          title: "Why we build Mekyro",
          paragraphs: [
            "For many manufacturers and trading companies, a deal is not one polished reply. It is an ongoing relationship shaped by repeated confirmation, follow-up, and missing information being filled in over time. A buyer may inquire on the website today, ask again on WhatsApp tomorrow, and move into quoting or payment weeks later.",
            "The difficulty is that this context often lives across different people, channels, and spreadsheets. When the team gets busy, customer memory breaks, quoting habits disappear, and past commitments need to be searched again. Mekyro is built for this basic but important problem: keeping the transaction process recorded, moving, and reusable.",
          ],
        },
        {
          title: "What we do",
          paragraphs: [
            "We bring customer communication, quote preparation, order follow-up, and knowledge capture into one workflow. Sales teams should not have to reorganize the same information across multiple tools or rely on personal memory to keep every customer moving.",
            "The system helps teams understand where a customer is, what should happen next, and which items need confirmation. Pricing, payment, refunds, authorization, and sensitive commitments still belong with people.",
          ],
        },
        {
          title: "Who we serve",
          paragraphs: [
            "We focus on cross-language, cross-time-zone, high-communication B2B teams, especially manufacturers, trading companies, and sales organizations that depend on long follow-up cycles and repeat business.",
            "These teams often do not lack products or effort. They need a stable operating base where every conversation keeps its context and team experience does not stay trapped in one person's memory.",
          ],
        },
        {
          title: "The boundary we believe in",
          paragraphs: [
            "Mekyro is not built to replace human judgment. We want the system to take care of repetitive, scattered, easy-to-miss work first, so people can focus on customer relationships, key commitments, and business strategy.",
            "Good automation should not create a feeling of lost control. It should make each step clearer: what was said, what comes next, what requires human confirmation, and which experience should be reused in the next deal.",
          ],
        },
      ],
      modelKicker: "Trading reality",
      modelTitle: "We start from real B2B deal work",
      modelLead: "For manufacturers and trading companies, the hard part is rarely one reply. It is keeping continuity across time zones, languages, and teams.",
      modelRows: [
        ["Customer questions should not scatter", "Inquiries, email, WhatsApp, and order status need to return to the same context."],
        ["Sales experience should not live in one person", "Quote habits, customer preferences, and loss reasons should become reusable team assets."],
        ["Critical commitments need control", "Pricing, payment, refunds, authorization, and sensitive commitments must be routed to human confirmation."],
      ],
      storyKicker: "What we solve",
      storyTitle: "B2B deals are not one reply. They are an ongoing relationship to move forward.",
      rows: [
        ["Why we build Mekyro", "Many manufacturers and trading companies do not lack products or effort. The hard part is stable response over long deal cycles while every customer context, promise, and next step stays intact."],
        ["How we work", "Mekyro brings communication, quoting, order follow-up, and knowledge capture into one workflow, so teams spend less time reorganizing and more time on real judgment."],
        ["Who we serve", "We focus on cross-language, cross-time-zone, high-communication B2B teams, especially flows with long follow-up cycles, repeat business, and multi-person collaboration."],
      ],
      principlesTitle: "How we build",
      principles: [
        ["Keep business moving", "The value is not another panel. It is daily follow-up, quote preparation, and order status moving along one stable line."],
        ["Let people judge what matters", "Teams should see the items that need confirmation, authorization, or intervention instead of every raw message."],
        ["Keep experience inside the system", "Every conversation, quote, order change, and loss reason should become reusable business knowledge."],
        ["Make boundaries explicit", "Pricing, payment, refunds, authorization, sensitive commitments, and customer data need clear permission and human confirmation rules."],
      ],
      ctaTitle: "Start with one real sales flow",
      ctaText: "If you want to understand whether Mekyro fits your transaction workflow, start with one real sales flow.",
      boundaryTitle: "What the official site carries",
      boundaryRows: [
        ["Brand understanding", "Explain what Mekyro is, who it fits, and which operating gaps it solves."],
        ["Supplier intake", "Let suppliers structure managed-service cooperation intent before the Mekyro team confirms the next step."],
        ["Buyer inquiry", "Keep a public Request a Quote entry. Buyers do not log in; they continue through secure transaction links."],
        ["Supplier backend entry", "Provide supplier backend login. Formal account provisioning is confirmed through the cooperation flow."],
      ],
    },
    aboutContact: {
      title: "Contact us",
      heading: "Happy to help you",
      lead: "You are welcome to contact us through any communication channel or visit us in person. We will get back to you as soon as possible.",
      imageAlt: "Mekyro contact visual",
      cards: [
        ["Office hours", "Monday to Friday, 9:30 - 18:30", "China Standard Time, holidays excluded."],
        ["Shanghai office", "China · Shanghai", "Hongqiao Zhanhui International, Building 6, Floor 9"],
        ["Shenzhen office", "China · Shenzhen", "T10, Tianmian International Creative Center"],
        ["Contact", "info@mangkeyi.com", "86-21-54313979"],
      ],
    },
    login: {
      title: "Supplier backend login",
      lead:
        "This page keeps only the supplier backend login. Buyers do not log in, and no other backend entry is shown.",
      demoNotice: "",
      tabPassword: "Password",
      tabSms: "SMS",
      tabEmail: "Email",
      supplier: {
        title: "Supplier backend login",
        text: "Use a supplier account to enter the backend and review AI-moving customers, actions to confirm, order state, operating reports, and authorization boundaries.",
        accountLabel: "Username",
        accountPlaceholder: "Enter username",
        passwordLabel: "Password",
        passwordPlaceholder: "Enter password",
        cta: "Enter supplier backend",
        hint: "Use an issued supplier account to sign in.",
        smsPhoneLabel: "Phone number",
        smsPhonePlaceholder: "Enter phone number",
        smsCta: "Enter supplier backend",
        smsHint: "Enter the phone number associated with your supplier account to receive a verification code.",
        emailLabel: "Email",
        emailPlaceholder: "Enter email address",
        emailCta: "Enter supplier backend",
        emailHint: "Enter the email associated with your supplier account to receive a verification code.",
      },
      showcase: {
        title: "Supplier Workspace Preview",
        text: "Browse the interactive prototype and feature demo of the supplier AI workspace without logging in.",
        cta: "View Demo",
        hint: "For showcase purposes only. Data is simulated.",
      },
      demos: [
        { title: "Supplier Platform Demo", text: "Browse the full feature prototype of the supplier AI workspace.", cta: "View legacy supplier demo", href: "/old/supplier" },
        { title: "AI Suite Demo", text: "Browse the AI command lab interactive demo.", cta: "View new supplier demo", href: "/old/ai-native-command-lab" },
        { title: "Operations Platform Demo", text: "Browse supplier management, Agent runs, and policy audit features in the internal ops backend.", cta: "View ops backend demo", href: "/old/ops" },
      ],
      proofRows: [
        ["Supplier entry", "This is only the supplier backend login and does not carry any other backend entry."],
        ["Buyer path", "Buyer inquiry stays at /contact/buyer. Quote, Payment, Order, Track, and Reorder continue through secure links."],
        ["Sign-in behavior", "A successful sign-in opens the supplier workspace."],
      ],
    },
    opsEntry: {
      title: "Internal ops entry",
      lead:
        "This is a private login entry for the Mekyro internal team. It is not shown in official navigation, footer, the supplier login page, or public CTAs.",
      demoNotice: "Internal accounts enter the operations backend here. This entry is for the internal Mekyro team only.",
      ops: {
        title: "Internal ops backend login",
        text: "Internal teams inspect suppliers, Agent activity views, exception queues, security policy, and platform operating state.",
        accountLabel: "Username",
        accountPlaceholder: "Enter username",
        passwordLabel: "Password",
        passwordPlaceholder: "Enter password",
        cta: "Enter internal ops",
        hint: "Internal entry, not part of the public official-site IA.",
      },
      proofRows: [
        ["Private entry", "Not shown in official navigation, footer, supplier backend entry, or public CTAs."],
        ["Sign-in behavior", "A successful sign-in opens the internal operations backend."],
        ["Permission boundary", "Real permissions, external systems, and sensitive actions are controlled by the corresponding backend services."],
      ],
    },
    contact: {
      title: "I am a supplier",
      lead: "",
      supplierTitle: "I am a supplier",
      supplierSubtitle: "Apply for Mekyro managed trade sales",
      supplierLead: "Tell us your business, customer sources, and the work you want AI to manage first, so the cooperation scope can be confirmed quickly.",
      fields: [
        "Company name",
        "Business or product category",
        "Country",
        "Contact name",
        "Phone number",
        "Email",
        "Remarks",
      ],
      buyerTitle: "I am a buyer",
      buyerPageTitle: "I am a buyer",
      buyerPageLead: "",
      buyerSubtitle: "Request a Quote",
      buyerLead:
        "After a buyer submits a request, Mekyro continues quote, payment, order, logistics tracking, and reorder context through authorized secure transaction links. Buyers do not create accounts.",
      buyerFields: [
        "Company name",
        "Required product",
        "Country",
        "Contact name",
        "Phone number",
        "Email",
        "Remarks",
      ],
      pipelineTitle: "What should happen after intake",
      pipelineRows: [
        ["Confirm scope", "Judge whether the team fits managed automated operations before selling a complex plan."],
        ["Map entry points", "Confirm which context can come from Email, WhatsApp, forms, API, or order systems."],
        ["Set boundaries", "Define what AI can execute, what must be confirmed, and how sensitive data is handled."],
      ],
      qaTitle: "Before cooperation",
      qaRows: [
        ["What happens after submission?", "This page structures the cooperation details. Formal submission and follow-up are confirmed by the Mekyro team."],
        ["Do we need full system APIs first?", "No. Start with managed scope, then decide the order of Email, WhatsApp, API, or VM integration."],
      ],
      stubNotice: "After submission, the Mekyro team will contact you soon to confirm the cooperation scope.",
      buyerStubNotice: "After submission, the Mekyro team will contact you soon to confirm your purchase request.",
      cta: "Submit cooperation request",
      buyerCta: "Submit purchase request",
    },
    security: {
      title: "Security, permissions, and AI boundaries",
      lead:
        "Mekyro's trust model is not unlimited AI action. It is AI running automatically within clear authorization, policy gates, and data isolation.",
      rows: [
        ["Isolated workspace", "Each customer's data, buyer-facing context, authorization settings, transaction records, and operating reports are isolated by default."],
        ["Permission boundary", "The official site only describes entries. Real authorization is enforced by authenticated workspaces and backend permission rules; frontend menus are not security controls."],
        ["AI automation boundary", "AI can prepare suggestions, run Skill workflows, organize Email, cite evidence, and move tasks; high-risk commitments require policy gates."],
        ["Sensitive data handling", "Token, API keys, VM credentials, payment information, and private knowledge do not appear on the official site or public copy."],
        ["Human intervention boundary", "Humans handle high-risk exceptions, authorization changes, and cooperation confirmation instead of turning daily operations back into manual queues."],
      ],
      automationTitle: "What AI can do automatically",
      automationRows: [
        ["Low-risk actions", "Organize leads, draft replies, update state, remind next steps, and compile knowledge."],
        ["Governed actions", "Quotes, inventory, delivery commitments, payment, and refunds go through policy gates or human confirmation."],
        ["Forbidden actions", "Read sensitive credentials without authorization, bypass permissions, fake payment results, or sign irreversible commitments for people."],
      ],
      buyerTitle: "Buyer questions",
      buyerRows: [
        ["Do buyers need accounts?", "No. Buyers continue through authorized secure transaction context and do not create official-site accounts."],
        ["Is buyer information shared across customers?", "It is not shown as public information. Buyer context belongs to the relevant transaction and authorization scope."],
      ],
    },
    pricing: {
      title: "Annual fee ¥29,800",
      lead: "",
      rows: [
        ["Limited-time price", "Annual fee ¥29,800 RMB. Original price ¥98,000 RMB."],
        ["Setup included", "Covers onboarding, product and knowledge initialization, workspace configuration, baseline setup, and managed service."],
        ["Operations included", "Covers AI sales follow-up, payment and fulfillment tracking, reorder prompts, and compounding knowledge."],
      ],
      valueTitle: "The fee maps to continuous operating capability",
      valueRows: [
        ["Lead to conversion", "Not just a page. AI continuously moves customers from lead to confirmation."],
        ["Transaction to reorder", "Not just order records. It follows payment, fulfillment, tracking, and reorder."],
        ["Experience to system", "Not individual memory. Wins and losses become the next best action."],
      ],
      qaTitle: "Pricing questions",
      qaRows: [
        ["What price is shown on the official site?", "The current limited-time price is ¥29,800 RMB per year. The original price is ¥98,000 RMB per year."],
        ["Will there be complex plans?", "Not now. The official site presents one annual managed service plan."],
      ],
    },
    faq: {
      title: "FAQ",
      lead: "Supplier, buyer, and cooperation questions are collected here. Answers stay collapsed until opened.",
      supplierTitle: "Supplier questions",
      buyerTitle: "Buyer questions",
      cooperationTitle: "Cooperation and pricing",
    },
  },
} as const;
