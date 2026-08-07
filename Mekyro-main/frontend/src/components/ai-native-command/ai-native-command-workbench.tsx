"use client";

import { useEffect, useState } from "react";
import { MekyroLogo } from "@/components/mekyro-logo";
import {
  BarChart3,
  Bot,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  FileText,
  Globe2,
  Home,
  LayoutDashboard,
  LogOut,
  PackageCheck,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import styles from "./ai-native-command-workbench.module.css";
import { CommandChatPanel } from "./command-chat-panel";
import {
  SupplierCommandSurface,
  type SupplierPageId,
} from "./supplier-command-surface";

type AiNativeCommandWorkbenchProps = {
  initialScreen?: string | null;
  initialTodoId?: string | null;
};

const supplierPages = [
  "home",
  "todo-items",
  "chat",
  "overview",
  "customer-summary",
  "customer-detail",
  "orders-summary",
  "orders-detail",
  "shipping-info",
  "live-ops",
  "ai-evolution",
  "work-report",
  "account-info",
  "authorization",
  "data-access",
] as const satisfies readonly SupplierPageId[];

const topNavigation = [
  { id: "home", label: "首页", icon: Home },
  { id: "overview", label: "总览", icon: LayoutDashboard },
] as const;

const groupedNavigation = [
  {
    title: "客户与订单",
    icon: ClipboardList,
    items: [
      { id: "customer-summary", label: "客户汇总", icon: UserRound },
      { id: "customer-detail", label: "客户详情", icon: FileText },
      { id: "orders-summary", label: "订单汇总", icon: BarChart3 },
      { id: "orders-detail", label: "订单详情", icon: FileText },
      { id: "shipping-info", label: "发货信息", icon: PackageCheck },
    ],
  },
  {
    title: "汇报与展示",
    icon: BarChart3,
    items: [
      { id: "live-ops", label: "实时运营大屏", icon: LayoutDashboard },
      { id: "ai-evolution", label: "AI进化大屏", icon: Bot },
      { id: "work-report", label: "工作汇报", icon: ClipboardList },
    ],
  },
  {
    title: "设置",
    icon: Settings,
    items: [
      { id: "account-info", label: "账号信息", icon: UserRound },
      { id: "authorization", label: "授权", icon: ShieldCheck },
      { id: "data-access", label: "资料与接入", icon: FileText },
    ],
  },
] as const;

function isSupplierPageId(value: string | null): value is SupplierPageId {
  return supplierPages.includes(value as SupplierPageId);
}

function getGroupTitleForPage(page: SupplierPageId) {
  return groupedNavigation.find((group) =>
    group.items.some((item) => item.id === page),
  )?.title;
}

function scrollToTodoCard(todoId: string) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      document
        .querySelector(`[data-todo-loop="${todoId}"]`)
        ?.scrollIntoView({ block: "center" });
    });
  });
}

export function AiNativeCommandWorkbench({
  initialScreen,
  initialTodoId,
}: AiNativeCommandWorkbenchProps) {
  const requestedInitialPage = initialScreen ?? null;
  const initialPage: SupplierPageId = isSupplierPageId(requestedInitialPage)
    ? requestedInitialPage
    : "home";
  const [activePage, setActivePage] = useState<SupplierPageId>(initialPage);
  const [chatReturnPage, setChatReturnPage] = useState<SupplierPageId>(initialPage);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [activeTodoId, setActiveTodoId] = useState<string | null>(initialTodoId ?? null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const screen = params.get("screen");
    const todoId = params.get("todo");
    if (params.has("surface")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("surface");
      window.history.replaceState(null, "", url);
    }
    if (isSupplierPageId(screen)) {
      setActivePage(screen);
      setActiveTodoId(todoId);
      const matchingGroup = getGroupTitleForPage(screen);
      if (matchingGroup) setExpandedGroups([matchingGroup]);
      if (screen === "todo-items" && todoId) {
        scrollToTodoCard(todoId);
      }
    }
  }, []);

  function navigate(page: SupplierPageId, options?: { todoId?: string | null }) {
    const todoId = options?.todoId ?? null;

    setActivePage(page);
    setActiveTodoId(todoId);
    if (page !== "chat") {
      setChatReturnPage(page);
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("surface");
    url.searchParams.set("screen", page);
    if (todoId) {
      url.searchParams.set("todo", todoId);
    } else {
      url.searchParams.delete("todo");
    }
    window.history.replaceState(null, "", url);
    const matchingGroup = getGroupTitleForPage(page);
    if (matchingGroup) {
      setExpandedGroups((current) =>
        current.includes(matchingGroup) ? current : [...current, matchingGroup],
      );
    }
    if (page === "todo-items" && todoId) {
      scrollToTodoCard(todoId);
    } else {
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0 }));
    }
  }

  function toggleGroup(title: string) {
    setExpandedGroups((current) =>
      current.includes(title)
        ? current.filter((item) => item !== title)
        : [...current, title],
    );
  }

  function openChat() {
    setChatReturnPage(activePage === "chat" ? chatReturnPage : activePage);
    navigate("chat");
  }

  return (
    <main
      className={styles.supplierShell}
      data-screen={activePage}
      data-surface="supplier"
    >
      <aside className={styles.sidebar} aria-label="供应商 2.0 概念页面导航">
        <div className={styles.sidebarBrand}>
          <MekyroLogo
            alt="Mekyro"
            className={styles.brandLogo}
            height={34}
            priority
            surface="light"
            width={152}
          />
        </div>

        <nav className={styles.navigation}>
          <div className={styles.navItems}>
            {topNavigation.map((item) => {
              const Icon = item.icon;
              const selected =
                activePage === item.id ||
                ((activePage === "chat" || activePage === "todo-items") && item.id === "home");

              return (
                <button
                  key={item.id}
                  type="button"
                  className={selected ? styles.navItemActive : styles.navItem}
                  aria-current={selected ? "page" : undefined}
                  onClick={() => navigate(item.id)}
                >
                  <span className={styles.navAccent} aria-hidden="true" />
                  <Icon size={18} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {groupedNavigation.map((group) => {
            const GroupIcon = group.icon;
            const expanded = expandedGroups.includes(group.title);

            return (
              <section
                key={group.title}
                className={expanded ? styles.navGroupOpen : styles.navGroup}
              >
                <button
                  type="button"
                  className={styles.navParent}
                  aria-expanded={expanded}
                  onClick={() => toggleGroup(group.title)}
                >
                  <GroupIcon size={18} aria-hidden="true" />
                  <span>{group.title}</span>
                  <ChevronDown size={16} aria-hidden="true" />
                </button>
                <div className={styles.navChildren}>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const selected = activePage === item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={selected ? styles.navItemActive : styles.navItem}
                        aria-current={selected ? "page" : undefined}
                        onClick={() => navigate(item.id)}
                      >
                        <span className={styles.navAccent} aria-hidden="true" />
                        <Icon size={17} aria-hidden="true" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </nav>

        <div className={styles.sidebarProfile} aria-label="当前供应商信息">
          <span>Mekyro 合成企业</span>
          <strong>负责人</strong>
        </div>
      </aside>

      <section
        className={styles.workspace}
        aria-label="供应商后台工作区"
      >
        <div className={styles.workspaceActions} aria-label="全站操作">
          <button type="button">
            <ExternalLink size={14} aria-hidden="true" />
            返回官网
          </button>
          <button type="button" className={styles.languageAction}>
            <Globe2 size={15} aria-hidden="true" />
            中文 / EN
          </button>
          <button type="button">
            <LogOut size={14} aria-hidden="true" />
            登出
          </button>
        </div>
        <SupplierCommandSurface
          activePage={activePage}
          chatReturnPage={chatReturnPage}
          activeTodoId={activeTodoId}
          onNavigate={navigate}
          onOpenChat={openChat}
        />
      </section>
    </main>
  );
}
