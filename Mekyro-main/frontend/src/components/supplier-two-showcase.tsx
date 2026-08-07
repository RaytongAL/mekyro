import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  ExternalLink,
  Globe2,
  Home,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  PackageCheck,
  Presentation,
  Send,
  Settings,
  TrendingUp,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { MekyroLogo } from "@/components/mekyro-logo";
import type { OfficialLocale } from "@/lib/official-site/content";

type DemoPhase = "home" | "chat";
type ProductFilmScene = "conversation" | "automation" | "memory" | "privacy";
type SceneDirection = "forward" | "backward";
type SceneTransitionPhase = "idle" | "out" | "in";
type MessageRole = "supplier" | "ai" | "thinking";

type MobileSwipeState = {
  isHorizontal: boolean;
  pointerId: number;
  x: number;
  y: number;
};

type DemoMessage = {
  answerIndex?: number;
  id: string;
  role: MessageRole;
  text?: string;
};

type DashboardMetric = {
  icon: LucideIcon;
  label: string;
  value: string;
};

type AutomationFilmNode = {
  caption: string;
  detail: string;
  icon: LucideIcon;
  label: string;
  meta: string;
};

type ShowcaseCopy = {
  assistantIntro: string;
  assistantLabel: string;
  automationActivityTitle: string;
  automationColumns: string[];
  automationDealMeta: string;
  automationDealStatus: string[];
  automationDealTitle: string;
  automationDealValue: string;
  automationFilmTitle: string;
  automationFocusLabels: string[];
  automationHeading: string;
  automationLabel: string;
  automationLead: string;
  automationSteps: {
    detail: string;
    title: string;
  }[];
  chips: string[];
  emptyInputText: string;
  filmTitle: string;
  footerActions: {
    sales: string;
    tasks: string;
  };
  homeInputPlaceholder: string;
  metrics: DashboardMetric[];
  memoryFilmTitle: string;
  nav: string[];
  privacyFilmTitle: string;
  questions: string[];
  salesTitle: string;
  sendLabel: string;
  taskScopes: string[];
  taskTitle: string;
  tasks: string[];
};

const showcaseCopy: Record<OfficialLocale, ShowcaseCopy> = {
  "zh-CN": {
    assistantIntro: "问我订单、收入、客户进度和今天要先处理的事。",
    assistantLabel: "AI助理",
    automationActivityTitle: "AI 动作记录",
    automationColumns: ["新询盘", "报价确认", "订单生成"],
    automationDealMeta: "定制配件 · 500 件 · 30 天交期",
    automationDealStatus: ["识别需求中", "报价已生成", "跟进消息已准备", "订单草稿已创建"],
    automationDealTitle: "德国客户询盘",
    automationDealValue: "¥86,000",
    automationFilmTitle: "AI全自动成交流程",
    automationFocusLabels: ["识别客户需求", "匹配报价规则", "准备跟进消息", "生成订单草稿"],
    automationHeading: "AI 正在推进一条新询盘",
    automationLabel: "AI 自动化成交演示",
    automationLead: "从客户询盘、报价匹配到订单草稿，关键节点由 AI 自动推进。",
    automationSteps: [
      { title: "识别询盘需求", detail: "德国客户需要 500 件定制配件，交期 30 天。" },
      { title: "匹配产品与报价", detail: "推荐报价 ¥86,000，毛利率 28%，交付风险低。" },
      { title: "生成跟进消息", detail: "报价说明、交期解释和下一步确认话术已准备。" },
      { title: "创建订单草稿", detail: "订单已生成草稿，等待负责人确认安全边界。" },
    ],
    chips: ["今天有哪些待办？", "新增了哪些客户？", "哪些订单需要确认？", "本月成交收入是多少？", "需要我审批什么？"],
    emptyInputText: "输入问题，按回车进入完整对话...",
    filmTitle: "简单对话掌握业务全局",
    footerActions: {
      sales: "查看全部销售数据",
      tasks: "查看全部待办",
    },
    homeInputPlaceholder: "问问 Mekyro AI",
    metrics: [
      { icon: CircleDollarSign, label: "本月成交收入", value: "¥486,000" },
      { icon: PackageCheck, label: "新增订单", value: "12" },
      { icon: TrendingUp, label: "客户转订单", value: "6" },
    ],
    memoryFilmTitle: "越来越聪明的AI业务团队",
    nav: ["首页", "总览", "客户与订单", "汇报与展示", "设置"],
    privacyFilmTitle: "销售资产只属于你",
    questions: ["现在有多少订单、多少收入？", "最近找了多少客户？分别是什么进度？", "那今天还有什么待办事项？"],
    salesTitle: "销售数据摘要",
    sendLabel: "发送",
    taskScopes: ["客户与订单", "资料与接入", "客户汇总"],
    taskTitle: "待办事项",
    tasks: ["德国客户报价待确认", "法国客户资料待补齐", "西班牙客户复购回访"],
  },
  "en-US": {
    assistantIntro: "Ask about orders, revenue, customer progress, and what needs attention today.",
    assistantLabel: "AI assistant",
    automationActivityTitle: "AI activity",
    automationColumns: ["New inquiry", "Quote confirmed", "Order created"],
    automationDealMeta: "Custom accessories · 500 units · 30-day delivery",
    automationDealStatus: ["Reading demand", "Quote generated", "Follow-up ready", "Order draft created"],
    automationDealTitle: "German customer inquiry",
    automationDealValue: "¥86,000",
    automationFilmTitle: "AI advances the deal",
    automationFocusLabels: ["Read customer demand", "Match quote rules", "Prepare follow-up", "Create order draft"],
    automationHeading: "AI is advancing a new inquiry",
    automationLabel: "AI automated deal demo",
    automationLead: "From inquiry to quote match and order draft, AI moves the key deal steps forward.",
    automationSteps: [
      { title: "Read inquiry demand", detail: "German customer needs 500 custom accessories with 30-day delivery." },
      { title: "Match product and quote", detail: "Recommended quote is ¥86,000, with 28% margin and low delivery risk." },
      { title: "Prepare follow-up message", detail: "Quote explanation, delivery note, and next-step copy are ready." },
      { title: "Create order draft", detail: "Order draft is created and waiting for owner confirmation." },
    ],
    chips: ["Today's tasks?", "New customers?", "Orders to confirm?", "Monthly revenue?", "What needs approval?"],
    emptyInputText: "Type a question and press Enter to open full chat...",
    filmTitle: "Supplier AI conversation",
    footerActions: {
      sales: "View all sales data",
      tasks: "View all tasks",
    },
    homeInputPlaceholder: "Ask Mekyro AI",
    metrics: [
      { icon: CircleDollarSign, label: "Closed revenue this month", value: "¥486,000" },
      { icon: PackageCheck, label: "New orders", value: "12" },
      { icon: TrendingUp, label: "Customers converted", value: "6" },
    ],
    memoryFilmTitle: "Business memory compounds",
    nav: ["Home", "Overview", "Customers & orders", "Reports", "Settings"],
    privacyFilmTitle: "Private sales assets",
    questions: ["How many orders and how much revenue do we have now?", "How many customers were recently found, and what is their progress?", "What should I handle today?"],
    salesTitle: "Sales summary",
    sendLabel: "Send",
    taskScopes: ["Customers & orders", "Materials", "Customer summary"],
    taskTitle: "Tasks",
    tasks: ["German customer quote pending", "French customer materials incomplete", "Spanish customer reorder follow-up"],
  },
};

const navIcons: LucideIcon[] = [Home, LayoutDashboard, UsersRound, Presentation, Settings];
const questionForTyping = "现在有多少订单、多少收入？";
const productFilmSceneOrder: ProductFilmScene[] = ["conversation", "automation", "memory", "privacy"];
const sceneExitDurationMs = 720;
const sceneEnterDurationMs = 1480;
const sceneTransitionDurationMs = sceneExitDurationMs + sceneEnterDurationMs + 80;
const automationFilmStepMs = 4800;
const automationFilmFinalHoldMs = 12000;
const mobileAutomationFilmStepMs = 1800;
const mobileAutomationFilmFinalHoldMs = 3800;

function getAutomationFilmNodes(locale: OfficialLocale): AutomationFilmNode[] {
  if (locale === "zh-CN") {
    return [
      { caption: "AI 扫描多渠道信号，识别高意向采购经理。", detail: "Daniel Kim · PCB Assembly", icon: UsersRound, label: "寻找客户", meta: "高意向客户" },
      { caption: "自动触达客户，并根据行业语境生成首封消息。", detail: "WhatsApp + Email 已发送", icon: Send, label: "联系客户", meta: "已建立联系" },
      { caption: "从对话中提取数量、交期、认证和价格关注点。", detail: "50K-100K pcs · 15-20 天", icon: ClipboardList, label: "探寻需求", meta: "需求已结构化" },
      { caption: "生成报价与购买链接，客户可直接进入下一步。", detail: "mekyro.com/p/quote/88371", icon: ExternalLink, label: "发送购买链接", meta: "链接已生成" },
      { caption: "收款完成后自动归档交易状态与凭证。", detail: "USD 28,560.00 · 已完成", icon: CircleDollarSign, label: "成交收款", meta: "收款成功" },
      { caption: "偏好、历史订单和复购窗口写入业务记忆。", detail: "复购概率 92%", icon: PackageCheck, label: "复购沉淀", meta: "记忆已更新" },
    ];
  }

  return [
    { caption: "AI scans multi-channel signals and finds a high-intent buyer.", detail: "Daniel Kim · PCB Assembly", icon: UsersRound, label: "Find buyer", meta: "High intent" },
    { caption: "AI reaches out with context-aware first-touch messaging.", detail: "WhatsApp + Email sent", icon: Send, label: "Contact", meta: "Connected" },
    { caption: "Demand, volume, timeline, certification, and price concerns are extracted.", detail: "50K-100K pcs · 15-20 days", icon: ClipboardList, label: "Discover need", meta: "Need structured" },
    { caption: "Quote and purchase link are generated for the next step.", detail: "mekyro.com/p/quote/88371", icon: ExternalLink, label: "Send link", meta: "Link ready" },
    { caption: "Payment status and receipt are archived automatically.", detail: "USD 28,560.00 · paid", icon: CircleDollarSign, label: "Payment", meta: "Paid" },
    { caption: "Preference, order history, and reorder timing become business memory.", detail: "Reorder probability 92%", icon: PackageCheck, label: "Memory", meta: "Memory updated" },
  ];
}

export function SupplierTwoShowcase({ locale, sectionId = "supplier-showcase" }: { locale: OfficialLocale; sectionId?: string }) {
  const copy = showcaseCopy[locale];
  const [phase, setPhase] = useState<DemoPhase>("home");
  const [scene, setScene] = useState<ProductFilmScene>("conversation");
  const [sceneDirection, setSceneDirection] = useState<SceneDirection>("forward");
  const [sceneTransitionPhase, setSceneTransitionPhase] = useState<SceneTransitionPhase>("idle");
  const [automationStep, setAutomationStep] = useState(0);
  const [typedText, setTypedText] = useState("");
  const [chatInputText, setChatInputText] = useState("");
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const bandRef = useRef<HTMLElement | null>(null);
  const heroSnapLockRef = useRef(false);
  const heroSnapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const sceneSwapRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneTransitionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneWheelLockRef = useRef(false);
  const showcaseSnapLockRef = useRef(false);
  const showcaseSnapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileSwipeRef = useRef<MobileSwipeState | null>(null);
  const mobileSwipeClickResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileSwipeSuppressClickRef = useRef(false);

  useEffect(() => {
    if (scene !== "conversation") {
      setTypedText("");
      setChatInputText("");
      setMessages([]);
      return;
    }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const visibleQuestion = locale === "zh-CN" ? questionForTyping : copy.questions[0];

    const schedule = (callback: () => void, delay: number) => {
      timers.push(
        setTimeout(() => {
          if (!cancelled) {
            callback();
          }
        }, delay),
      );
    };

    const reset = () => {
      setScene("conversation");
      setPhase("home");
      setTypedText("");
      setChatInputText("");
      setMessages([]);
    };

    const scheduleChatTyping = (text: string, startDelay: number) => {
      let typingDelay = startDelay;
      const step = text.length > 28 ? 3 : 2;

      schedule(() => setChatInputText(""), typingDelay);
      for (let index = step; index <= text.length; index += step) {
        const partial = text.slice(0, index);
        schedule(() => setChatInputText(partial), typingDelay);
        typingDelay += 74;
      }
      schedule(() => setChatInputText(text), typingDelay);

      return typingDelay + 180;
    };

    const playCycle = (startDelay = 0) => {
      schedule(reset, startDelay);

      let cursorDelay = startDelay + 650;
      for (let index = 1; index <= visibleQuestion.length; index += 2) {
        const partial = visibleQuestion.slice(0, index);
        schedule(() => setTypedText(partial), cursorDelay);
        cursorDelay += 105;
      }
      schedule(() => setTypedText(visibleQuestion), cursorDelay + 80);

      let timelineDelay = cursorDelay + 850;
      schedule(() => {
        setPhase("chat");
        setChatInputText("");
        setMessages([]);
      }, timelineDelay);

      copy.questions.forEach((question, index) => {
        timelineDelay += index === 0 ? 450 : 1450;
        timelineDelay = scheduleChatTyping(question, timelineDelay);
        schedule(() => {
          setChatInputText("");
          setMessages((current) => [
            ...current,
            {
              id: `supplier-${index}`,
              role: "supplier",
              text: question,
            },
          ]);
        }, timelineDelay);

        timelineDelay += 850;
        schedule(() => {
          setMessages((current) => [
            ...current,
            {
              id: `thinking-${index}`,
              role: "thinking",
              text: "Thinking……",
            },
          ]);
        }, timelineDelay);

        timelineDelay += 1250;
        schedule(() => {
          setMessages((current) => [
            ...current.filter((message) => message.id !== `thinking-${index}`),
            {
              answerIndex: index,
              id: `ai-${index}`,
              role: "ai",
            },
          ]);
        }, timelineDelay);
      });

      schedule(() => playCycle(0), timelineDelay + 7200);
    };

    playCycle();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [copy.questions, locale, scene]);

  useEffect(() => {
    if (scene !== "automation") {
      return;
    }

    let cancelled = false;
    const nodeCount = getAutomationFilmNodes(locale).length;
    const stepDuration = sectionId === "mobile-supplier-showcase" ? mobileAutomationFilmStepMs : automationFilmStepMs;
    const finalHoldDuration = sectionId === "mobile-supplier-showcase" ? mobileAutomationFilmFinalHoldMs : automationFilmFinalHoldMs;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const schedule = (callback: () => void, delay: number) => {
      timers.push(
        setTimeout(() => {
          if (!cancelled) {
            callback();
          }
        }, delay),
      );
    };

    const playAutomationLoop = () => {
      setAutomationStep(0);

      for (let index = 1; index < nodeCount; index += 1) {
        schedule(() => setAutomationStep(index), index * stepDuration);
      }

      schedule(playAutomationLoop, (nodeCount - 1) * stepDuration + finalHoldDuration);
    };

    playAutomationLoop();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [locale, scene, sectionId]);

  useEffect(() => {
    return () => {
      if (sceneTransitionRef.current) {
        clearTimeout(sceneTransitionRef.current);
      }

      if (sceneSwapRef.current) {
        clearTimeout(sceneSwapRef.current);
      }

      if (heroSnapTimeoutRef.current) {
        clearTimeout(heroSnapTimeoutRef.current);
      }

      if (showcaseSnapTimeoutRef.current) {
        clearTimeout(showcaseSnapTimeoutRef.current);
      }

      if (mobileSwipeClickResetRef.current) {
        clearTimeout(mobileSwipeClickResetRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (phase !== "chat" || !transcriptRef.current) {
      return;
    }

    const transcript = transcriptRef.current;
    const scrollToBottom = () => {
      transcript.scrollTop = transcript.scrollHeight;
    };
    const firstFrame = requestAnimationFrame(() => {
      scrollToBottom();
      requestAnimationFrame(scrollToBottom);
    });
    const delayedScroll = setTimeout(scrollToBottom, 120);

    scrollToBottom();

    return () => {
      cancelAnimationFrame(firstFrame);
      clearTimeout(delayedScroll);
    };
  }, [messages, phase]);

  const sceneRoutes: { id: ProductFilmScene; label: string }[] = [
    { id: "conversation", label: copy.filmTitle },
    { id: "automation", label: copy.automationFilmTitle },
    { id: "memory", label: copy.memoryFilmTitle },
    { id: "privacy", label: copy.privacyFilmTitle },
  ];
  const currentSceneIndex = productFilmSceneOrder.indexOf(scene);
  const currentSceneRoute = sceneRoutes[currentSceneIndex] ?? sceneRoutes[0];

  const switchProductScene = useCallback((nextScene: ProductFilmScene, direction: SceneDirection) => {
    if (nextScene === scene || sceneWheelLockRef.current) {
      return;
    }

    sceneWheelLockRef.current = true;
    setSceneDirection(direction);
    setSceneTransitionPhase("out");

    if (sceneTransitionRef.current) {
      clearTimeout(sceneTransitionRef.current);
    }

    if (sceneSwapRef.current) {
      clearTimeout(sceneSwapRef.current);
    }

    sceneSwapRef.current = setTimeout(() => {
      setScene(nextScene);
      setSceneTransitionPhase("in");
      setPhase("home");
      setTypedText("");
      setChatInputText("");
      setMessages([]);

      if (nextScene === "automation") {
        setAutomationStep(0);
      }

      sceneSwapRef.current = null;
    }, sceneExitDurationMs);

    sceneTransitionRef.current = setTimeout(() => {
      setSceneTransitionPhase("idle");
      sceneWheelLockRef.current = false;
      sceneTransitionRef.current = null;
    }, sceneTransitionDurationMs);
  }, [scene]);

  const handleShowcaseWheel = useCallback((event: WheelEvent) => {
    if (Math.abs(event.deltaY) < 20 || Math.abs(event.deltaY) < Math.abs(event.deltaX)) {
      return;
    }

    const currentSceneIndex = productFilmSceneOrder.indexOf(scene);
    const nextScene = productFilmSceneOrder[currentSceneIndex + 1];
    const previousScene = productFilmSceneOrder[currentSceneIndex - 1];

    if (event.deltaY < 0 && !previousScene) {
      return;
    }

    const band = bandRef.current;

    if (band) {
      const navOffset = window.matchMedia("(max-width: 820px)").matches ? 64 : 68;
      const bandRect = band.getBoundingClientRect();
      const targetTop = Math.max(0, window.scrollY + bandRect.top - navOffset);
      const isBandInView = bandRect.top < window.innerHeight && bandRect.bottom > navOffset;
      const isBandMisaligned = Math.abs(window.scrollY - targetTop) > 12;

      if (isBandInView && isBandMisaligned) {
        event.preventDefault();
        event.stopPropagation();

        if (!showcaseSnapLockRef.current) {
          showcaseSnapLockRef.current = true;
          window.scrollTo({ behavior: "smooth", top: targetTop });

          if (showcaseSnapTimeoutRef.current) {
            clearTimeout(showcaseSnapTimeoutRef.current);
          }

          showcaseSnapTimeoutRef.current = setTimeout(() => {
            showcaseSnapLockRef.current = false;
            showcaseSnapTimeoutRef.current = null;
          }, 820);
        }

        return;
      }
    }

    if (sceneWheelLockRef.current) {
      if (sceneTransitionPhase === "out") {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    if (event.deltaY > 0 && nextScene) {
      event.preventDefault();
      event.stopPropagation();
      switchProductScene(nextScene, "forward");
      return;
    }

    if (event.deltaY < 0 && previousScene) {
      event.preventDefault();
      event.stopPropagation();
      switchProductScene(previousScene, "backward");
    }
  }, [scene, sceneTransitionPhase, switchProductScene]);

  const handleSceneRouteSelect = (nextScene: ProductFilmScene) => {
    if (nextScene === scene) {
      return;
    }

    switchProductScene(nextScene, productFilmSceneOrder.indexOf(nextScene) > productFilmSceneOrder.indexOf(scene) ? "forward" : "backward");
  };

  const handleAdjacentSceneSelect = (direction: SceneDirection) => {
    const nextScene = productFilmSceneOrder[currentSceneIndex + (direction === "forward" ? 1 : -1)];

    if (!nextScene) {
      return;
    }

    switchProductScene(nextScene, direction);
  };

  const scheduleMobileSwipeClickReset = () => {
    if (mobileSwipeClickResetRef.current) {
      clearTimeout(mobileSwipeClickResetRef.current);
    }

    mobileSwipeClickResetRef.current = setTimeout(() => {
      mobileSwipeSuppressClickRef.current = false;
      mobileSwipeClickResetRef.current = null;
    }, 420);
  };

  const handleMobileSwipePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (sectionId !== "mobile-supplier-showcase" || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }

    mobileSwipeRef.current = {
      isHorizontal: false,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleMobileSwipePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const swipe = mobileSwipeRef.current;

    if (!swipe || swipe.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - swipe.x;
    const deltaY = event.clientY - swipe.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!swipe.isHorizontal && absX > 14 && absX > absY * 1.2) {
      swipe.isHorizontal = true;
    }

    if (swipe.isHorizontal) {
      event.preventDefault();
    }
  };

  const handleMobileSwipePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const swipe = mobileSwipeRef.current;

    if (!swipe || swipe.pointerId !== event.pointerId) {
      return;
    }

    mobileSwipeRef.current = null;

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const deltaX = event.clientX - swipe.x;
    const deltaY = event.clientY - swipe.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (absX < 48 || absX < absY * 1.2) {
      return;
    }

    const direction: SceneDirection = deltaX < 0 ? "forward" : "backward";
    const nextScene = productFilmSceneOrder[currentSceneIndex + (direction === "forward" ? 1 : -1)];

    if (!nextScene) {
      return;
    }

    mobileSwipeSuppressClickRef.current = true;
    scheduleMobileSwipeClickReset();
    switchProductScene(nextScene, direction);
  };

  const handleMobileSwipePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mobileSwipeRef.current?.pointerId === event.pointerId) {
      mobileSwipeRef.current = null;
    }

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleMobileEdgeClick = (direction: SceneDirection) => (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (mobileSwipeSuppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      mobileSwipeSuppressClickRef.current = false;
      return;
    }

    handleAdjacentSceneSelect(direction);
  };

  useEffect(() => {
    const band = bandRef.current;

    if (!band) {
      return;
    }

    band.addEventListener("wheel", handleShowcaseWheel, { capture: true, passive: false });

    return () => {
      band.removeEventListener("wheel", handleShowcaseWheel, true);
    };
  }, [handleShowcaseWheel]);

  useEffect(() => {
    const minDesktopViewport = window.matchMedia("(min-width: 821px)");
    const navOffset = 68;

    const handleHeroToShowcaseWheel = (event: WheelEvent) => {
      const band = bandRef.current;

      if (!band || !minDesktopViewport.matches || event.defaultPrevented || event.deltaY <= 0 || Math.abs(event.deltaY) < Math.abs(event.deltaX)) {
        return;
      }

      if (event.target instanceof Node && band.contains(event.target)) {
        return;
      }

      const bandTop = band.getBoundingClientRect().top;
      const isBeforeShowcase = bandTop > navOffset + 20;
      const isHeroToShowcaseRange = bandTop < window.innerHeight * 1.2;

      if (!isBeforeShowcase || !isHeroToShowcaseRange) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (heroSnapLockRef.current) {
        return;
      }

      heroSnapLockRef.current = true;
      window.scrollTo({
        behavior: "smooth",
        top: Math.max(0, window.scrollY + bandTop - navOffset),
      });

      if (heroSnapTimeoutRef.current) {
        clearTimeout(heroSnapTimeoutRef.current);
      }

      heroSnapTimeoutRef.current = setTimeout(() => {
        heroSnapLockRef.current = false;
        heroSnapTimeoutRef.current = null;
      }, 900);
    };

    window.addEventListener("wheel", handleHeroToShowcaseWheel, { capture: true, passive: false });

    return () => {
      window.removeEventListener("wheel", handleHeroToShowcaseWheel, true);
    };
  }, []);

  useEffect(() => {
    if (sectionId !== "mobile-supplier-showcase") {
      return;
    }

    const mobileViewport = window.matchMedia("(max-width: 820px)");
    let isSnapping = false;
    let settleTimer: number | undefined;
    let releaseTimer: number | undefined;

    const releaseSnap = () => {
      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => {
        isSnapping = false;
      }, 720);
    };

    const snapIfNearShowcase = () => {
      const band = bandRef.current;

      if (!band || !mobileViewport.matches || isSnapping) {
        return;
      }

      const navOffset = 64;
      const rect = band.getBoundingClientRect();
      const targetTop = Math.max(0, window.scrollY + rect.top - navOffset);
      const isNearSecondScreen = rect.top > navOffset - 120 && rect.top < navOffset + 180 && rect.bottom > window.innerHeight * 0.56;
      const needsSnap = Math.abs(window.scrollY - targetTop) > 6;

      if (!isNearSecondScreen || !needsSnap) {
        return;
      }

      isSnapping = true;
      window.scrollTo({ behavior: "smooth", top: targetTop });
      releaseSnap();
    };

    const handleMobileShowcaseScroll = () => {
      if (isSnapping) {
        return;
      }

      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(snapIfNearShowcase, 110);
    };

    window.addEventListener("scroll", handleMobileShowcaseScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleMobileShowcaseScroll);
      window.clearTimeout(settleTimer);
      window.clearTimeout(releaseTimer);
    };
  }, [sectionId]);

  return (
    <section className={`supplier-showcase-band${sectionId === "mobile-supplier-showcase" ? " supplier-showcase-band-mobile" : ""}`} id={sectionId} aria-label={locale === "zh-CN" ? "供应商 AI 工作台动效演示" : "Supplier AI workspace motion demo"} ref={bandRef}>
      <div className="supplier-film-stage">
        <div className="supplier-film-stage-head" aria-label={locale === "zh-CN" ? "产品场景" : "Product scenes"}>
          <div className="supplier-mobile-scene-current" aria-live="polite">
            {currentSceneRoute.label}
          </div>
          <div className="supplier-film-scene-list" role="tablist" aria-label={locale === "zh-CN" ? "场景切换" : "Scene switcher"}>
            {sceneRoutes.map((route) => (
              <button
                aria-selected={scene === route.id}
                className={`supplier-film-scene-tab${scene === route.id ? " is-active" : ""}`}
                key={route.id}
                onClick={() => handleSceneRouteSelect(route.id)}
                role="tab"
                type="button"
              >
                {route.label}
              </button>
            ))}
          </div>
        </div>

        <div className={`supplier-film-lens${sceneTransitionPhase !== "idle" ? ` is-switching is-${sceneDirection} is-${sceneTransitionPhase}` : ""}`}>
          <div className={`supplier-showcase-product${scene === "automation" ? " supplier-showcase-product-automation" : ""}${scene === "memory" ? " supplier-showcase-product-memory" : ""}${scene === "privacy" ? " supplier-showcase-product-privacy" : ""}`}>
            {scene === "automation" ? (
              <SupplierAutomationScene copy={copy} locale={locale} step={automationStep} />
            ) : scene === "memory" ? (
              <SupplierMemoryScene locale={locale} />
            ) : scene === "privacy" ? (
              <SupplierPrivacyScene locale={locale} />
            ) : (
              <>
                <SupplierRail copy={copy} />
                <div className="supplier-workspace">
                  <div className={`supplier-home-view${phase === "home" ? " is-active" : ""}`} aria-hidden={phase !== "home"}>
                    <SupplierHome copy={copy} locale={locale} typedText={typedText} />
                  </div>
                  <div className={`supplier-chat-view${phase === "chat" ? " is-active" : ""}`} aria-hidden={phase !== "chat"}>
                    <SupplierChat copy={copy} chatInputText={chatInputText} locale={locale} messages={messages} transcriptRef={transcriptRef} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className={`supplier-mobile-film${sceneTransitionPhase !== "idle" ? ` is-switching is-${sceneDirection} is-${sceneTransitionPhase}` : ""}`}>
          <div
            className="supplier-mobile-film-viewport"
            onPointerCancel={handleMobileSwipePointerCancel}
            onPointerDown={handleMobileSwipePointerDown}
            onPointerMove={handleMobileSwipePointerMove}
            onPointerUp={handleMobileSwipePointerEnd}
          >
            <SupplierMobileScene automationStep={automationStep} copy={copy} locale={locale} scene={scene} />
            <button
              aria-label={locale === "zh-CN" ? "返回上一个场景" : "Previous scene"}
              className="supplier-mobile-edge supplier-mobile-edge-left"
              disabled={currentSceneIndex <= 0}
              onClick={handleMobileEdgeClick("backward")}
              type="button"
            />
            <button
              aria-label={locale === "zh-CN" ? "切换到下一个场景" : "Next scene"}
              className="supplier-mobile-edge supplier-mobile-edge-right"
              disabled={currentSceneIndex >= productFilmSceneOrder.length - 1}
              onClick={handleMobileEdgeClick("forward")}
              type="button"
            />
          </div>

          <div className="supplier-mobile-dots" aria-label={locale === "zh-CN" ? "移动端场景进度" : "Mobile scene progress"}>
            {sceneRoutes.map((route) => (
              <button
                aria-label={locale === "zh-CN" ? `切换到${route.label}` : `Switch to ${route.label}`}
                aria-pressed={scene === route.id}
                className={scene === route.id ? "is-active" : ""}
                key={route.id}
                onClick={() => handleSceneRouteSelect(route.id)}
                type="button"
              />
            ))}
          </div>
        </div>

        <div className="supplier-film-scene-rail" aria-label={locale === "zh-CN" ? "场景进度切换" : "Scene progress switcher"}>
          {sceneRoutes.map((route) => (
            <button
              aria-label={locale === "zh-CN" ? `切换到${route.label}` : `Switch to ${route.label}`}
              aria-pressed={scene === route.id}
              className={`supplier-film-scene-marker${scene === route.id ? " is-active" : ""}`}
              key={route.id}
              onClick={() => handleSceneRouteSelect(route.id)}
              type="button"
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function SupplierMobileScene({
  automationStep,
  copy,
  locale,
  scene,
}: {
  automationStep: number;
  copy: ShowcaseCopy;
  locale: OfficialLocale;
  scene: ProductFilmScene;
}) {
  if (scene === "automation") {
    return <SupplierMobileAutomationScene locale={locale} step={automationStep} />;
  }

  if (scene === "memory") {
    return <SupplierMobileMemoryScene locale={locale} />;
  }

  if (scene === "privacy") {
    return <SupplierMobilePrivacyScene locale={locale} />;
  }

  return <SupplierMobileConversationScene copy={copy} locale={locale} />;
}

function SupplierMobileConversationScene({ copy, locale }: { copy: ShowcaseCopy; locale: OfficialLocale }) {
  const isZh = locale === "zh-CN";
  const [visibleCount, setVisibleCount] = useState(0);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [typedInput, setTypedInput] = useState("");
  const [streamingAiReply, setStreamingAiReply] = useState<{ index: number; text: string } | null>(null);
  const dialogue: { role: "supplier" | "ai"; text: string }[] = isZh
    ? [
        { role: "supplier", text: "现在有多少订单、多少收入？" },
        { role: "ai", text: "本月成交收入 ¥486,000，新增订单 12 个，6 个客户已进入订单。" },
        { role: "supplier", text: "最近找了多少客户？" },
        { role: "ai", text: "已筛出 8 个高意向客户，德国客户正在等报价确认。" },
        { role: "supplier", text: "哪些最值得跟？" },
        { role: "ai", text: "西班牙客户进入复购窗口，法国客户缺认证资料。" },
        { role: "supplier", text: "今天我先处理什么？" },
        { role: "ai", text: "先确认德国报价，再补齐法国资料，随后发送西班牙复购提醒。" },
        { role: "supplier", text: "这些动作能自动推进吗？" },
        { role: "ai", text: "可以。我会继续跟进，涉及授权和付款节点再提醒你确认。" },
      ]
    : [
        { role: "supplier", text: "How many orders and how much revenue do we have?" },
        { role: "ai", text: "Revenue is $486K this month, with 12 new orders and 6 buyers now in order stage." },
        { role: "supplier", text: "How many buyers did we find recently?" },
        { role: "ai", text: "Eight high-intent buyers are ready. Germany is waiting for quote confirmation." },
        { role: "supplier", text: "Which ones matter most today?" },
        { role: "ai", text: "Spain is in a reorder window, and France still needs certification materials." },
        { role: "supplier", text: "What should I handle first?" },
        { role: "ai", text: "Confirm Germany, complete France, then send Spain a reorder reminder." },
        { role: "supplier", text: "Can those actions keep moving by themselves?" },
        { role: "ai", text: "Yes. I will continue the follow-up and ask for approval at authorization or payment points." },
      ];
  const inputPlaceholder = isZh ? "输入业务问题..." : "Ask a business question...";

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const schedule = (callback: () => void, delay: number) => {
      timers.push(
        setTimeout(() => {
          if (!cancelled) {
            callback();
          }
        }, delay),
      );
    };

    const playDialogue = () => {
      setVisibleCount(0);
      setIsAiThinking(false);
      setTypedInput("");
      setStreamingAiReply(null);

      let delay = 240;

      dialogue.forEach((item, index) => {
        if (item.role === "supplier") {
          const typeSteps = Math.min(8, Math.max(5, Math.ceil(item.text.length / 5)));

          Array.from({ length: typeSteps }).forEach((_, stepIndex) => {
            schedule(() => {
              const end = Math.max(1, Math.ceil(item.text.length * ((stepIndex + 1) / typeSteps)));
              setTypedInput(item.text.slice(0, end));
            }, delay + stepIndex * 150);
          });

          delay += typeSteps * 150 + 220;

          schedule(() => {
            setVisibleCount(index + 1);
            setTypedInput("");
          }, delay);

          delay += 560;
          return;
        }

        schedule(() => setIsAiThinking(true), delay);
        delay += 900;
        schedule(() => {
          setIsAiThinking(false);
          setStreamingAiReply({ index, text: "" });
        }, delay);

        const streamSteps = Math.min(10, Math.max(6, Math.ceil(item.text.length / 7)));

        Array.from({ length: streamSteps }).forEach((_, stepIndex) => {
          schedule(() => {
            const end = Math.max(1, Math.ceil(item.text.length * ((stepIndex + 1) / streamSteps)));
            setStreamingAiReply({ index, text: item.text.slice(0, end) });
          }, delay + stepIndex * 145);
        });

        delay += streamSteps * 145 + 180;

        schedule(() => {
          setStreamingAiReply(null);
          setVisibleCount(index + 1);
        }, delay);

        delay += 860;
      });

      schedule(playDialogue, delay + 6000);
    };

    playDialogue();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [isZh]);

  return (
    <section className="supplier-mobile-scene supplier-mobile-conversation" aria-label={copy.filmTitle}>
      <div className="supplier-mobile-dialogue" aria-label={isZh ? "供应商与 AI 对话" : "Supplier and AI dialogue"}>
        <div className="supplier-mobile-dialogue-feed">
          {dialogue.slice(0, visibleCount).map((item, index) => (
            <div
              aria-label={item.role === "supplier" ? (isZh ? "供应商消息" : "Supplier message") : isZh ? "AI 回复" : "AI reply"}
              className={`supplier-mobile-dialogue-bubble is-${item.role}`}
              key={`${item.role}-${index}`}
            >
              <span className="supplier-mobile-dialogue-avatar" aria-hidden="true">
                {item.role === "ai" ? "AI" : ""}
              </span>
              <p>{item.text}</p>
            </div>
          ))}
          {streamingAiReply ? (
            <div className="supplier-mobile-dialogue-bubble is-ai is-streaming" aria-label={isZh ? "AI 正在生成回复" : "AI is generating a reply"}>
              <span className="supplier-mobile-dialogue-avatar" aria-hidden="true">
                AI
              </span>
              <p>{streamingAiReply.text || (isZh ? "正在生成" : "Generating")}</p>
            </div>
          ) : null}
          {isAiThinking ? (
            <div className="supplier-mobile-dialogue-bubble is-ai is-thinking" aria-label={isZh ? "AI 正在思考" : "AI is thinking"}>
              <span className="supplier-mobile-dialogue-avatar" aria-hidden="true">
                AI
              </span>
              <p>
                <b>Thinking</b>
                <span className="supplier-mobile-thinking-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </p>
            </div>
          ) : null}
        </div>
        <div className={`supplier-mobile-dialogue-input${typedInput ? " is-typing" : ""}`}>
          <span className="supplier-mobile-dialogue-input-text">{typedInput || inputPlaceholder}</span>
          <span className="supplier-mobile-dialogue-input-cursor" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}

function SupplierMobileAutomationScene({ locale, step }: { locale: OfficialLocale; step: number }) {
  const nodes = getAutomationFilmNodes(locale);
  const activeStep = Math.min(step, nodes.length - 1);

  return (
    <section className="supplier-mobile-scene supplier-mobile-automation" aria-label={locale === "zh-CN" ? "AI 全自动成交流程" : "Automated deal flow"}>
      <ol className="supplier-mobile-step-list">
        {nodes.map((node, index) => {
          const Icon = node.icon;
          const isActive = index === activeStep;
          const isDone = index < activeStep;

          return (
            <li className={`${isActive ? "is-active" : ""}${isDone ? " is-done" : ""}`} key={node.label}>
              <span className="supplier-mobile-step-icon">
                <Icon size={17} />
              </span>
              <div className="supplier-mobile-step-copy">
                <strong>{node.label}</strong>
                <p>{node.caption}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function SupplierMobileMemoryScene({ locale }: { locale: OfficialLocale }) {
  const isZh = locale === "zh-CN";
  const leaves = isZh ? ["客户偏好", "报价边界", "采购周期", "复购窗口", "相似机会"] : ["Preference", "Quote rules", "Cycle", "Reorder", "Opportunity"];

  return (
    <section className="supplier-mobile-scene supplier-mobile-memory supplier-mobile-memory-tree-scene" aria-label={isZh ? "业务记忆持续进化" : "Business memory evolves"}>
      <div className="supplier-mobile-tree" aria-label={isZh ? "业务记忆树生长" : "Business memory tree grows"}>
        <span className="supplier-mobile-tree-ground" />
        <span className="supplier-mobile-tree-trunk" />
        <span className="supplier-mobile-tree-branch supplier-mobile-tree-branch-one" />
        <span className="supplier-mobile-tree-branch supplier-mobile-tree-branch-two" />
        <span className="supplier-mobile-tree-branch supplier-mobile-tree-branch-three" />
        <span className="supplier-mobile-tree-branch supplier-mobile-tree-branch-four" />
        <div className="supplier-mobile-tree-leaves">
          {leaves.map((leaf) => (
            <span key={leaf}>{leaf}</span>
          ))}
        </div>
        <strong>{isZh ? "业务记忆生长" : "Memory grows"}</strong>
      </div>
    </section>
  );
}

function SupplierMobilePrivacyScene({ locale }: { locale: OfficialLocale }) {
  const isZh = locale === "zh-CN";
  const assets = isZh ? ["客户名单", "报价策略", "沟通记忆"] : ["Buyer list", "Quote rules", "Conversation memory"];

  return (
    <section className="supplier-mobile-scene supplier-mobile-privacy" aria-label={isZh ? "销售资产只属于你" : "Private sales assets"}>
      <div className="supplier-mobile-privacy-neighbor supplier-mobile-privacy-neighbor-top">
        <span>{isZh ? "其它供应商空间 A" : "Supplier space A"}</span>
        <em>{isZh ? "不可访问" : "No access"}</em>
      </div>
      <div className="supplier-mobile-privacy-connector supplier-mobile-privacy-connector-top" aria-hidden="true">
        <span className="supplier-mobile-privacy-connector-line" />
        <span className="supplier-mobile-privacy-lock">
          <LockKeyhole size={16} />
        </span>
      </div>
      <div className="supplier-mobile-vault">
        <span className="supplier-mobile-vault-ring" />
        <span className="supplier-mobile-vault-scan" />
        <strong>{isZh ? "安全保密的隔离环境" : "Secure isolated environment"}</strong>
      </div>
      <div className="supplier-mobile-privacy-assets">
        {assets.map((asset) => (
          <span key={asset}>{asset}</span>
        ))}
      </div>
      <div className="supplier-mobile-privacy-connector supplier-mobile-privacy-connector-bottom" aria-hidden="true">
        <span className="supplier-mobile-privacy-connector-line" />
        <span className="supplier-mobile-privacy-lock">
          <LockKeyhole size={16} />
        </span>
      </div>
      <div className="supplier-mobile-privacy-neighbor supplier-mobile-privacy-neighbor-bottom">
        <span>{isZh ? "其它供应商空间 B" : "Supplier space B"}</span>
        <em>{isZh ? "不可访问" : "No access"}</em>
      </div>
    </section>
  );
}

function SupplierMemoryScene({ locale }: { locale: OfficialLocale }) {
  const isZh = locale === "zh-CN";
  const stages = isZh
    ? [
        { index: "01", label: "学习积累", title: "扫描并提取成交经验" },
        { index: "02", label: "进化生长", title: "经验变成业务能力" },
        { index: "03", label: "下次复用", title: "调用策略生成任务" },
      ]
    : [
        { index: "01", label: "Learn", title: "Extract deal experience" },
        { index: "02", label: "Evolve", title: "Experience becomes capability" },
        { index: "03", label: "Reuse", title: "Generate next actions" },
      ];
  const papers = isZh ? ["合同", "沟通记录", "报价"] : ["Contract", "Messages", "Quote"];
  const leaves = isZh ? ["客户偏好", "报价策略", "采购周期", "复购窗口", "相似机会"] : ["Preference", "Quote rules", "Purchase cycle", "Reorder window", "Similar buyer"];
  const tasks = isZh ? ["复购提醒", "跟进话术", "相似买家"] : ["Reorder reminder", "Follow-up script", "Similar buyer"];
  const scannerLabel = isZh ? "AI学习积累" : "AI learning";
  const taskStatus = isZh ? "待执行" : "Queued";

  return (
    <section className="supplier-memory-film" aria-label={isZh ? "业务记忆持续进化演示" : "Business memory evolution demo"}>
      <div className="supplier-memory-arrow supplier-memory-arrow-one" aria-hidden="true" />
      <div className="supplier-memory-arrow supplier-memory-arrow-two" aria-hidden="true" />

      <ol className="supplier-memory-stages">
        <li className="supplier-memory-stage supplier-memory-stage-scan">
          <SupplierMemoryStageHead {...stages[0]} />
          {papers.map((paper, index) => (
            <span className={`supplier-memory-paper supplier-memory-paper-${index + 1}`} key={paper}>
              <strong>{paper}</strong>
            </span>
          ))}
          <div className="supplier-memory-scanner" data-label={scannerLabel}>
            <span className="supplier-memory-scan-light" />
          </div>
        </li>

        <li className="supplier-memory-stage supplier-memory-stage-growth">
          <SupplierMemoryStageHead {...stages[1]} />
          <div className="supplier-memory-tree" aria-hidden="true">
            <span className="supplier-memory-sprout" />
            <span className="supplier-memory-branch supplier-memory-branch-1" />
            <span className="supplier-memory-branch supplier-memory-branch-left supplier-memory-branch-2" />
            <span className="supplier-memory-branch supplier-memory-branch-3" />
            <span className="supplier-memory-branch supplier-memory-branch-left supplier-memory-branch-4" />
            <span className="supplier-memory-branch supplier-memory-branch-5" />
            <div className="supplier-memory-leaves">
              {leaves.map((leaf, index) => (
                <span className={`supplier-memory-leaf supplier-memory-leaf-${index + 1}`} key={leaf}>{leaf}</span>
              ))}
            </div>
          </div>
        </li>

        <li className="supplier-memory-stage supplier-memory-stage-reuse">
          <SupplierMemoryStageHead {...stages[2]} />
          <div className="supplier-memory-assembler">
            <div className="supplier-memory-task-list">
              {tasks.map((task) => (
                <span data-status={taskStatus} key={task}>{task}</span>
              ))}
            </div>
          </div>
        </li>
      </ol>
    </section>
  );
}

function SupplierMemoryStageHead({ index, label, title }: { index: string; label: string; title: string }) {
  return (
    <div className="supplier-memory-stage-head">
      <span>{index} {label}</span>
      <strong>{title}</strong>
    </div>
  );
}

function SupplierPrivacyScene({ locale }: { locale: OfficialLocale }) {
  const isZh = locale === "zh-CN";
  const copy = isZh
    ? {
        assets: {
          buyers: "客户名单",
          memory: "沟通记忆",
          quotes: "报价策略",
        },
        core: "安全保密的隔离环境",
        data: {
          buyers: { meta: "Daniel · Sarah", title: "买家名单" },
          chat: { meta: "偏好 · 复购窗口", title: "沟通内容" },
          quotes: { meta: "MOQ · 折扣边界", title: "报价记录" },
        },
        principles: ["跨供应商不可读", "独立记忆库", "授权范围内调用"],
        silo: "其它供应商空间",
      }
    : {
        assets: {
          buyers: "Buyer list",
          memory: "Conversation memory",
          quotes: "Quote rules",
        },
        core: "Secure isolated environment",
        data: {
          buyers: { meta: "Daniel · Sarah", title: "Buyer list" },
          chat: { meta: "Preference · reorder window", title: "Conversation" },
          quotes: { meta: "MOQ · discount boundary", title: "Quote records" },
        },
        principles: ["Unreadable across suppliers", "Isolated memory", "Authorized use only"],
        silo: "Other supplier space",
      };

  return (
    <section className="supplier-privacy-film" aria-label={isZh ? "销售资产隔离演示" : "Private sales assets demo"}>
      <aside className="supplier-privacy-silo supplier-privacy-silo-left" aria-hidden="true">
        <span>{copy.silo}</span>
      </aside>
      <aside className="supplier-privacy-silo supplier-privacy-silo-right" aria-hidden="true">
        <span>{copy.silo}</span>
      </aside>

      <div className="supplier-privacy-barrier supplier-privacy-barrier-left" aria-hidden="true">
        <span className="supplier-privacy-lock" />
      </div>
      <div className="supplier-privacy-barrier supplier-privacy-barrier-right" aria-hidden="true">
        <span className="supplier-privacy-lock" />
      </div>

      <article className="supplier-privacy-domain">
        <div className="supplier-privacy-boundary" />
        <svg className="supplier-privacy-loop" viewBox="0 0 424 280" aria-hidden="true">
          <path d="M212 24 C334 24 392 78 392 140 C392 208 326 256 212 256 C98 256 32 208 32 140 C32 78 90 24 212 24" />
          <path className="supplier-privacy-loop-active" d="M212 24 C334 24 392 78 392 140 C392 208 326 256 212 256 C98 256 32 208 32 140 C32 78 90 24 212 24" />
        </svg>

        <div className="supplier-privacy-core"><b>{copy.core}</b></div>
        <span className="supplier-privacy-asset supplier-privacy-asset-buyers">{copy.assets.buyers}</span>
        <span className="supplier-privacy-asset supplier-privacy-asset-quotes">{copy.assets.quotes}</span>
        <span className="supplier-privacy-asset supplier-privacy-asset-memory">{copy.assets.memory}</span>
      </article>

      <div className="supplier-privacy-data supplier-privacy-data-buyers">
        <b>{copy.data.buyers.title}</b>
        <span>{copy.data.buyers.meta}</span>
      </div>
      <div className="supplier-privacy-data supplier-privacy-data-quotes">
        <b>{copy.data.quotes.title}</b>
        <span>{copy.data.quotes.meta}</span>
      </div>
      <div className="supplier-privacy-data supplier-privacy-data-chat">
        <b>{copy.data.chat.title}</b>
        <span>{copy.data.chat.meta}</span>
      </div>

      <div className="supplier-privacy-principles" aria-hidden="true">
        {copy.principles.map((principle) => (
          <span key={principle}>{principle}</span>
        ))}
      </div>
    </section>
  );
}

function SupplierAutomationScene({ copy, locale, step }: { copy: ShowcaseCopy; locale: OfficialLocale; step: number }) {
  const nodes = getAutomationFilmNodes(locale);
  const activeStep = Math.min(step, nodes.length - 1);

  return (
    <section className="supplier-automation-film" aria-label={copy.automationLabel}>
      <ol className="supplier-automation-nodes">
        {nodes.map((node, index) => {
          const Icon = node.icon;
          const isActive = index === activeStep;
          const isDone = index < activeStep;
          const isRevealed = index < activeStep;

          return (
            <li className={`supplier-automation-node${isActive ? " is-active" : ""}${isDone ? " is-done" : ""}${isRevealed ? " is-revealed" : ""}`} key={node.label}>
              {index < nodes.length - 1 ? <span aria-hidden="true" className={`supplier-automation-connector${index < activeStep ? " is-complete" : ""}`} /> : null}

              <article className="supplier-automation-proof">
                <span>{node.meta}</span>
                <strong>{node.detail}</strong>
                <p>{node.caption}</p>
              </article>

              <div className="supplier-automation-orbit" aria-hidden="true">
                <Icon size={24} />
                <span className="supplier-automation-orbit-light" />
              </div>

              <div className="supplier-automation-node-label">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{node.label}</strong>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function SupplierRail({ activeIndex = 0, copy }: { activeIndex?: number; copy: ShowcaseCopy }) {
  return (
    <aside className="supplier-rail" aria-label="Supplier navigation">
      <div className="supplier-rail-brand">
        <MekyroLogo alt="Mekyro" className="supplier-rail-logo" height={38} surface="light" width={152} />
      </div>
      <nav>
        {copy.nav.map((item, index) => {
          const Icon = navIcons[index % navIcons.length];
          const active = index === activeIndex;
          const isGroup = index > 1;
          return (
            <span className={`supplier-nav-item${active ? " is-active" : ""}${isGroup ? " is-group" : ""}`} key={item}>
              <span className="supplier-nav-accent" aria-hidden="true" />
              <Icon size={16} />
              <span className="supplier-nav-label">{item}</span>
              {isGroup ? <ChevronDown size={15} /> : null}
            </span>
          );
        })}
      </nav>
      <div className="supplier-rail-profile">
        <span>示例企业</span>
        <strong>负责人</strong>
      </div>
    </aside>
  );
}

function SupplierHome({ copy, locale, typedText }: { copy: ShowcaseCopy; locale: OfficialLocale; typedText: string }) {
  return (
    <div className="supplier-workspace-layout">
      <WorkspaceActions locale={locale} />
      <div className="supplier-demo-surface" data-active-page="home">
        <section className="supplier-ai-entry" aria-label="首页 AI 助理入口">
          <div className="supplier-ai-title-row">
            <AiAvatar />
            <div>
              <strong>{copy.assistantLabel}</strong>
              <p>{copy.assistantIntro}</p>
            </div>
          </div>
          <div className="supplier-chip-row">
            {copy.chips.map((chip) => (
              <button key={chip} type="button">{chip}</button>
            ))}
          </div>
          <div className="supplier-home-input" aria-label={copy.homeInputPlaceholder}>
            <span className={`supplier-home-input-text${typedText ? " is-typed" : ""}`}>{typedText || copy.emptyInputText}</span>
            <button type="button">
              <Send size={15} />
              <span className="supplier-send-label">{copy.sendLabel}</span>
            </button>
          </div>
        </section>

        <div className="supplier-home-cards">
          <section className="supplier-demo-panel supplier-task-panel">
            <PanelHead icon={ClipboardList} title={copy.taskTitle} />
            <div className="supplier-task-list">
              {copy.tasks.map((task, index) => (
                <button key={task} type="button">
                  <span>{index + 1}</span>
                  <strong>{task}</strong>
                  <small>{copy.taskScopes[index]}</small>
                  <em>›</em>
                </button>
              ))}
            </div>
            <div className="supplier-card-footer-action">
              <button type="button">{copy.footerActions.tasks}</button>
            </div>
          </section>
          <section className="supplier-demo-panel supplier-sales-summary-card">
            <PanelHead icon={TrendingUp} title={copy.salesTitle} />
            <div className="supplier-demo-metric-grid">
              {copy.metrics.map((metric) => (
                <button key={metric.label} type="button">
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </button>
              ))}
            </div>
            <div className="supplier-card-footer-action">
              <button type="button">{copy.footerActions.sales}</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function WorkspaceActions({ locale }: { locale: OfficialLocale }) {
  const labels =
    locale === "zh-CN"
      ? { aria: "全站操作", language: "中文 / EN", logout: "登出", returnToOfficial: "返回官网" }
      : { aria: "Global actions", language: "EN / 中文", logout: "Log out", returnToOfficial: "Back to site" };

  return (
    <div className="supplier-workspace-actions" aria-label={labels.aria}>
      <button type="button">
        <ExternalLink size={14} />
        <span>{labels.returnToOfficial}</span>
      </button>
      <button className="supplier-language-action" type="button">
        <Globe2 size={15} />
        <span>{labels.language}</span>
      </button>
      <button type="button">
        <LogOut size={14} />
        <span>{labels.logout}</span>
      </button>
    </div>
  );
}

function SupplierChat({
  chatInputText,
  copy,
  locale,
  messages,
  transcriptRef,
}: {
  chatInputText: string;
  copy: ShowcaseCopy;
  locale: OfficialLocale;
  messages: DemoMessage[];
  transcriptRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="supplier-workspace-layout">
      <WorkspaceActions locale={locale} />
      <div className="supplier-demo-surface" data-active-page="chat">
        <section className="supplier-chat-page-panel" aria-label="完整对话页面">
          <div className="supplier-chat-transcript" ref={transcriptRef}>
            {messages.map((message) => (
              <ChatMessageBubble copy={copy} key={message.id} message={message} />
            ))}
          </div>
          <div className="supplier-chat-input">
            <span className={`supplier-chat-input-text${chatInputText ? " is-typing" : ""}`}>{chatInputText}</span>
            <button aria-label="Send message" type="button">
              <Send size={15} />
              <span className="supplier-send-label">{copy.sendLabel}</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function ChatMessageBubble({ copy, message }: { copy: ShowcaseCopy; message: DemoMessage }) {
  const isSupplier = message.role === "supplier";
  const isThinking = message.role === "thinking";

  return (
    <article className={`supplier-message supplier-message-${message.role}`}>
      <MessageAvatar role={isSupplier ? "supplier" : "ai"} />
      <div className="supplier-message-content">
        {isThinking ? (
          <p>{message.text}</p>
        ) : message.role === "ai" ? (
          <AnswerContent copy={copy} index={message.answerIndex ?? 0} />
        ) : (
          <p>{message.text}</p>
        )}
      </div>
    </article>
  );
}

function AnswerContent({ copy, index }: { copy: ShowcaseCopy; index: number }) {
  const isChinese = copy.nav[0] === "首页";

  if (index === 0) {
    return <p>{isChinese ? "本月成交收入 ¥486,000，新增订单 12 个，客户转订单 6 个；还有 2 个报价待确认、3 个资料待补齐，建议先处理会影响成交的客户。" : "Closed revenue this month is ¥486,000, with 12 new orders and 6 customers converted to orders. There are also 2 quotes pending confirmation and 3 customers missing materials, so handle deal-blocking items first."}</p>;
  }

  if (index === 1) {
    return <p>{isChinese ? "最近新增客户 8 个，沟通客户 64 个。德国客户报价待确认，法国客户资料待补齐，西班牙客户需要复购回访。" : "There are 8 new customers and 64 contacted customers. The German customer quote is pending confirmation, the French customer still needs materials completed, and the Spanish customer needs a reorder follow-up."}</p>;
  }

  return <p>{isChinese ? "今天优先处理 3 件事：确认德国客户报价、补齐法国客户资料、回访西班牙客户复购。" : "Prioritize 3 things today: confirm the German customer quote, complete the French customer materials, and follow up with the Spanish customer about reorder intent."}</p>;
}

function PanelHead({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="supplier-demo-panel-head">
      <Icon size={16} />
      <strong>{title}</strong>
    </div>
  );
}

function AiAvatar() {
  return (
    <span className="supplier-ai-avatar" aria-hidden="true">
      AI
    </span>
  );
}

function MessageAvatar({ role }: { role: "supplier" | "ai" }) {
  if (role === "ai") {
    return (
      <span className="supplier-message-avatar supplier-message-avatar-ai" aria-hidden="true">
        AI
      </span>
    );
  }

  return (
    <span className="supplier-message-avatar supplier-message-avatar-person" aria-hidden="true">
      <span className="supplier-avatar-hair" />
      <span className="supplier-avatar-face">
        <span className="supplier-avatar-eye supplier-avatar-eye-left" />
        <span className="supplier-avatar-eye supplier-avatar-eye-right" />
        <span className="supplier-avatar-mouth" />
      </span>
      <span className="supplier-avatar-shirt" />
    </span>
  );
}
