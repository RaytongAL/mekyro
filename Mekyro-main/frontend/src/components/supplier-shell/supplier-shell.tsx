import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MekyroLogo } from "@/components/mekyro-logo";
import { BorderGlow } from "@/components/border-glow";
import { useLocale } from "@/hooks/use-locale";
import {
  BarChart3,
  CircleUserRound,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  FileText,
  Globe2,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Package,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  Sun,
  UserRound,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Avatar, AvatarBadge, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { TOKEN_COOKIE_NAME } from "@/lib/auth/core";
import { api, type ApiResponse } from "@/lib/api";
import { onboardingSessionStore } from "@/lib/agent/onboarding-session-store";
import { useTheme } from "@/hooks/use-theme";
import { SiteViewModeToggle } from "@/components/site-view-mode-toggle";
import type { OfficialViewportMode } from "@/lib/official-site/content";

import styles from "./supplier-shell.module.css";
import { CommandChatPanel } from "./command-chat-panel";
import {
  SupplierCommandSurface,
  supplierPageHasAssistant,
  type SupplierPageId,
} from "./supplier-command-surface";

type AiNativeCommandWorkbenchProps = {
  initialScreen?: string | null;
  initialTodoId?: string | null;
  viewMode?: OfficialViewportMode;
};

const supplierPages = [
  "home",
  "todo-items",
  "chat",
  "overview",
  "customer-summary",
  "customer-detail",
  "leads",
  "contact-logs",
  "orders-summary",
  "orders-detail",
  "shipping-info",
  "live-ops",
  "ai-evolution",
  "work-report",
  "account-info",
  "authorization",
  "data-access",
  "supplier-products",
  "supplier-inventory-logs",
  "supplier-settings",
] as const satisfies readonly SupplierPageId[];

const topNavigation = [
  { id: "home", label: "supplierNav.home", icon: Home },
  { id: "overview", label: "supplierNav.overview", icon: LayoutDashboard },
] as const;

const leadNavigation = [
  { id: "leads", label: "supplierNav.leads", icon: UserRound },
  { id: "contact-logs", label: "supplierNav.contactLogs", icon: MessageSquare },
] as const;

const orderNavigation = [
  { id: "orders-summary", label: "supplierNav.ordersSummary", icon: BarChart3 },
  { id: "orders-detail", label: "supplierNav.ordersDetail", icon: FileText },
  { id: "shipping-info", label: "supplierNav.shippingInfo", icon: PackageCheck },
] as const;

const productNavigation = [
  { id: "supplier-products", label: "supplierNav.products", icon: Package },
  { id: "supplier-inventory-logs", label: "supplierNav.inventoryLogs", icon: ClipboardList },
] as const;

const settingsNavigation = [
  { id: "supplier-settings", label: "supplierNav.supplierConfig", icon: Settings },
] as const;

function isSupplierPageId(value: string | null): value is SupplierPageId {
  return supplierPages.includes(value as SupplierPageId);
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

type SupplierAccountMenuProps = {
  isSuperuser: boolean;
  onEnterOps: () => void;
  onOpenOfficialSite: () => void;
  onLogout: () => void;
  t: ReturnType<typeof useTranslation>["t"];
};

function SupplierAccountMenu({
  isSuperuser,
  onEnterOps,
  onOpenOfficialSite,
  onLogout,
  t,
}: SupplierAccountMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={styles.accountMenuTrigger}
            aria-label={t("ops.accountMenu")}
            title={t("ops.accountMenu")}
          />
        )}
      >
        <CircleUserRound aria-hidden="true" />
        <ChevronDown data-icon="inline-end" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={styles.accountMenuContent}>
        <DropdownMenuGroup>
          {isSuperuser ? (
            <DropdownMenuItem onClick={onEnterOps}>
              <Settings aria-hidden="true" />
              {t("common.opsManagement")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={onOpenOfficialSite}>
            <ExternalLink aria-hidden="true" />
            {t("common.openOfficialSite")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onClick={onLogout}>
            <LogOut aria-hidden="true" />
            {t("common.logout")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type SupplierSidebarBodyProps = {
  activePage: SupplierPageId;
  onNavigate: (page: SupplierPageId) => void;
  salesNavOpen: boolean;
  ordersNavOpen: boolean;
  productNavOpen: boolean;
  settingsNavOpen: boolean;
  setSalesNavOpen: (open: boolean) => void;
  setOrdersNavOpen: (open: boolean) => void;
  setProductNavOpen: (open: boolean) => void;
  setSettingsNavOpen: (open: boolean) => void;
  isDarkTheme: boolean;
  themeToggleLabel: string;
  toggleTheme: () => void;
  profileInitial: string;
  workspaceLabel: string;
  userLabel: string;
  t: ReturnType<typeof useTranslation>["t"];
};

function SupplierSidebarBody(props: SupplierSidebarBodyProps) {
  const {
    activePage,
    onNavigate,
    salesNavOpen,
    ordersNavOpen,
    setSalesNavOpen,
    setOrdersNavOpen,
    productNavOpen,
    setProductNavOpen,
    settingsNavOpen,
    setSettingsNavOpen,
    isDarkTheme,
    themeToggleLabel,
    toggleTheme,
    profileInitial,
    workspaceLabel,
    userLabel,
    t,
  } = props;
  const salesNavActive = leadNavigation.some((item) => item.id === activePage);
  const ordersNavActive = orderNavigation.some((item) => item.id === activePage);
  const productNavActive = productNavigation.some((item) => item.id === activePage);
  const themeControlLabel = t("common.darkMode");
  const themeSwitchId = "supplier-theme-switch";

  return (
    <>
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
                onClick={() => onNavigate(item.id)}
              >
                <span className={styles.navAccent} aria-hidden="true" />
                <Icon size={18} aria-hidden="true" />
                <span>{t(item.label)}</span>
              </button>
            );
          })}
        </div>

        <Collapsible
          className={salesNavOpen ? styles.navGroupOpen : styles.navGroup}
          open={salesNavOpen}
          onOpenChange={setSalesNavOpen}
        >
          <CollapsibleTrigger
            className={`${styles.navParent} ${salesNavActive ? styles.navParentActive : ""}`}
            type="button"
          >
            <span className={styles.navAccent} aria-hidden="true" />
            <UserRound size={18} aria-hidden="true" />
            <span>{t("supplierNav.salesLeads")}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent className={styles.navChildren}>
            {leadNavigation.map((item) => {
              const Icon = item.icon;
              const selected = activePage === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  className={selected ? styles.navItemActive : styles.navItem}
                  aria-current={selected ? "page" : undefined}
                  onClick={() => onNavigate(item.id)}
                >
                  <span className={styles.navAccent} aria-hidden="true" />
                  <Icon size={18} aria-hidden="true" />
                  <span>{t(item.label)}</span>
                </button>
              );
            })}
          </CollapsibleContent>
        </Collapsible>

        <Collapsible
          className={ordersNavOpen ? styles.navGroupOpen : styles.navGroup}
          open={ordersNavOpen}
          onOpenChange={setOrdersNavOpen}
        >
          <CollapsibleTrigger
            className={`${styles.navParent} ${ordersNavActive ? styles.navParentActive : ""}`}
            type="button"
          >
            <span className={styles.navAccent} aria-hidden="true" />
            <BarChart3 size={18} aria-hidden="true" />
            <span>{t("supplierNav.orders")}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent className={styles.navChildren}>
            {orderNavigation.map((item) => {
              const Icon = item.icon;
              const selected = activePage === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  className={selected ? styles.navItemActive : styles.navItem}
                  aria-current={selected ? "page" : undefined}
                  onClick={() => onNavigate(item.id)}
                >
                  <span className={styles.navAccent} aria-hidden="true" />
                  <Icon size={18} aria-hidden="true" />
                  <span>{t(item.label)}</span>
                </button>
              );
            })}
          </CollapsibleContent>
        </Collapsible>

        <Collapsible
          className={productNavOpen ? styles.navGroupOpen : styles.navGroup}
          open={productNavOpen}
          onOpenChange={setProductNavOpen}
        >
          <CollapsibleTrigger
            className={`${styles.navParent} ${productNavActive ? styles.navParentActive : ""}`}
            type="button"
          >
            <span className={styles.navAccent} aria-hidden="true" />
            <Package size={18} aria-hidden="true" />
            <span>{t("supplierNav.productGroup")}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent className={styles.navChildren}>
            {productNavigation.map((item) => {
              const Icon = item.icon;
              const selected = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={selected ? styles.navItemActive : styles.navItem}
                  aria-current={selected ? "page" : undefined}
                  onClick={() => onNavigate(item.id)}
                >
                  <span className={styles.navAccent} aria-hidden="true" />
                  <Icon size={18} aria-hidden="true" />
                  <span>{t(item.label)}</span>
                </button>
              );
            })}
          </CollapsibleContent>
        </Collapsible>

        <Collapsible
          className={settingsNavOpen ? styles.navGroupOpen : styles.navGroup}
          open={settingsNavOpen}
          onOpenChange={setSettingsNavOpen}
        >
          <CollapsibleTrigger className={`${styles.navParent}`} type="button">
            <span className={styles.navAccent} aria-hidden="true" />
            <Settings size={18} aria-hidden="true" />
            <span>{t("supplierNav.settings")}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent className={styles.navChildren}>
            {settingsNavigation.map((item) => {
              const Icon = item.icon;
              const selected = activePage === item.id;
              return (
                <button key={item.id} type="button" className={selected ? styles.navItemActive : styles.navItem} aria-current={selected ? "page" : undefined} onClick={() => onNavigate(item.id)}>
                  <span className={styles.navAccent} aria-hidden="true" />
                  <Icon size={18} aria-hidden="true" />
                  <span>{t(item.label)}</span>
                </button>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      </nav>

      <Separator className={styles.sidebarFooterSeparator} />

      <label className={styles.themeToggle} htmlFor={themeSwitchId}>
        {isDarkTheme ? <Sun size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />}
        <span className={styles.themeToggleText}>{themeControlLabel}</span>
        <Switch
          id={themeSwitchId}
          aria-label={themeControlLabel}
          checked={isDarkTheme}
          className={styles.themeSwitch}
          onCheckedChange={() => toggleTheme()}
        />
      </label>

      <div className={styles.sidebarProfile} aria-label="当前供应商信息">
        <Avatar className={styles.sidebarProfileAvatar} size="default">
          <AvatarFallback className={styles.sidebarProfileFallback}>
            {profileInitial}
          </AvatarFallback>
          <AvatarBadge className={styles.sidebarProfileBadge} />
        </Avatar>
        <div className={styles.sidebarProfileText}>
          <span>{workspaceLabel}</span>
          <strong>{userLabel}</strong>
        </div>
      </div>
    </>
  );
}

export function SupplierShell({
  initialScreen,
  initialTodoId,
  viewMode = "auto",
}: AiNativeCommandWorkbenchProps) {
  const requestedInitialPage = initialScreen ?? null;
  const initialPage: SupplierPageId = isSupplierPageId(requestedInitialPage)
    ? requestedInitialPage
    : "home";
  const [activePage, setActivePage] = useState<SupplierPageId>(initialPage);
  const [salesNavOpen, setSalesNavOpen] = useState(() =>
    leadNavigation.some((item) => item.id === initialPage),
  );
  const [ordersNavOpen, setOrdersNavOpen] = useState(() =>
    orderNavigation.some((item) => item.id === initialPage),
  );
  const [productNavOpen, setProductNavOpen] = useState(() =>
    productNavigation.some((item) => item.id === initialPage),
  );
  const [settingsNavOpen, setSettingsNavOpen] = useState(false);
  const [chatReturnPage, setChatReturnPage] = useState<SupplierPageId>(initialPage);
  const [activeTodoId, setActiveTodoId] = useState<string | null>(initialTodoId ?? null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [enterpriseName, setEnterpriseName] = useState("");
  const [userName, setUserName] = useState("");
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [popoverHovered, setPopoverHovered] = useState(false);
  const hoverOpenTimer = useRef<number | undefined>(undefined);
  const hoverCloseTimer = useRef<number | undefined>(undefined);
  const { resolvedTheme, toggle: toggleTheme } = useTheme();
  const { locale, toggleLocale } = useLocale();
  const { t } = useTranslation();

  const goTo = useNavigate();
  const assistantAvailable = supplierPageHasAssistant(activePage);
  const assistantTitle = t("supplier.assistantSheetTitle");
  const assistantActionLabel = t("supplier.assistantActionLabel");
  const isDarkTheme = resolvedTheme === "dark";
  const themeToggleLabel = isDarkTheme ? t("common.lightMode") : t("common.darkMode");
  const workspaceLabel = enterpriseName || (locale === "zh-CN" ? "供应商工作区" : "Supplier workspace");
  const userLabel = userName || (locale === "zh-CN" ? "供应商账号" : "Supplier account");
  const profileInitial = (userLabel || workspaceLabel || "M").trim().slice(0, 1).toUpperCase();
  const footerYear = new Date().getFullYear();
  const salesNavActive = leadNavigation.some((item) => item.id === activePage);
  const ordersNavActive = orderNavigation.some((item) => item.id === activePage);
  const productNavActive = productNavigation.some((item) => item.id === activePage);
  const mobileMenuLabel = locale === "zh-CN" ? "菜单" : "Menu";
  const mobileNavLabel = locale === "zh-CN" ? "供应商后台导航" : "Supplier workspace navigation";

  useEffect(() => {
    const stored = sessionStorage.getItem("user");
    if (stored) {
      try {
        const user = JSON.parse(stored);
        setIsSuperuser(!!user.is_superuser);
        const ws = user.workspaces?.[0];
        if (ws) {
          setEnterpriseName(ws.workspace_name ?? "");
          setUserName(ws.ws_user_name ?? user.nickname ?? "");
        }
        return;
      } catch {
        sessionStorage.removeItem("user");
      }
    }

    api<ApiResponse<{ nickname?: string; username?: string; is_superuser?: boolean; workspaces?: Array<{ workspace_name?: string; ws_user_name?: string }> }>>("/api/user/info/")
      .then((data) => {
        if (data?.code !== 200 || !data.data) return;
        const user = data.data;
        setIsSuperuser(!!user.is_superuser);
        sessionStorage.setItem("user", JSON.stringify(user));
        const ws = user.workspaces?.[0];
        if (ws) {
          setEnterpriseName(ws.workspace_name ?? "");
          setUserName(ws.ws_user_name ?? user.nickname ?? "");
        }
      })
      .catch(() => { /* ignore */ });
  }, []);

  const handleLogout = useCallback(() => {
    onboardingSessionStore.clearForLogout();
    document.cookie = `${TOKEN_COOKIE_NAME}=; path=/; max-age=0; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    sessionStorage.removeItem("user");
    goTo("/login");
  }, [goTo]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const screen = params.get("screen");
    const todoId = params.get("todo");
    if (params.has("surface")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("surface");
      goTo({ pathname: "/supplier", search: url.searchParams.toString() }, { replace: true });
    }
    if (isSupplierPageId(screen)) {
      setActivePage(screen);
      setActiveTodoId(todoId);
      if (screen === "todo-items" && todoId) {
        scrollToTodoCard(todoId);
      }
    }
  }, []);

  useEffect(() => {
    if (salesNavActive) {
      setSalesNavOpen(true);
    }
    if (ordersNavActive) {
      setOrdersNavOpen(true);
    }
    if (productNavActive) {
      setProductNavOpen(true);
    }
  }, [ordersNavActive, salesNavActive, productNavActive]);

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage.getItem("supplier:sidebar-collapsed") === "true") {
        setSidebarCollapsed(true);
      }
    } catch {
      /* localStorage 不可用时忽略 */
    }
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("supplier:sidebar-collapsed", String(sidebarCollapsed));
      }
    } catch {
      /* localStorage 不可用时忽略 */
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    return () => {
      window.clearTimeout(hoverOpenTimer.current);
      window.clearTimeout(hoverCloseTimer.current);
    };
  }, []);

  const handleSidebarEnter = useCallback(() => {
    if (!sidebarCollapsed) return;
    window.clearTimeout(hoverCloseTimer.current);
    hoverOpenTimer.current = window.setTimeout(() => setPopoverHovered(true), 100);
  }, [sidebarCollapsed]);

  const handleSidebarLeave = useCallback(() => {
    if (!sidebarCollapsed) return;
    window.clearTimeout(hoverOpenTimer.current);
    hoverCloseTimer.current = window.setTimeout(() => setPopoverHovered(false), 200);
  }, [sidebarCollapsed]);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((v) => !v);
    setPopoverHovered(false);
  }, []);

  function navigate(page: SupplierPageId, options?: { todoId?: string | null }) {
    const todoId = options?.todoId ?? null;

    setActivePage(page);
    setActiveTodoId(todoId);
    setPopoverHovered(false);
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
    goTo({ pathname: "/supplier", search: url.searchParams.toString() }, { replace: true });
    if (page === "todo-items" && todoId) {
      scrollToTodoCard(todoId);
    } else {
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0 }));
    }
  }

  function navigateFromMobile(page: SupplierPageId) {
    setMobileMenuOpen(false);
    navigate(page);
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
      data-view-mode={viewMode}
      data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
    >
      <aside
        className={styles.sidebar}
        aria-label="供应商 2.0 概念页面导航"
        data-popover-open={sidebarCollapsed && popoverHovered ? "true" : "false"}
        onMouseEnter={handleSidebarEnter}
        onMouseLeave={handleSidebarLeave}
      >
        <div className={styles.sidebarBrand}>
          {!sidebarCollapsed ? (
            <button
              type="button"
              className={styles.brandButton}
              aria-label={locale === "zh-CN" ? "返回供应商后台首页" : "Back to supplier home"}
              title={locale === "zh-CN" ? "返回供应商后台首页" : "Back to supplier home"}
              onClick={() => navigate("home")}
            >
              <MekyroLogo
                alt="Mekyro"
                className={styles.brandLogo}
                height={29}
                priority
                surface={isDarkTheme ? "dark" : "light"}
                width={128}
              />
            </button>
          ) : null}
          <button
            type="button"
            className={styles.collapseToggle}
            aria-label={sidebarCollapsed ? t("shell.expandSidebar") : t("shell.collapseSidebar")}
            title={sidebarCollapsed ? t("shell.expandSidebar") : t("shell.collapseSidebar")}
            onClick={toggleSidebarCollapsed}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
          </button>
        </div>

        {!sidebarCollapsed ? (
          <SupplierSidebarBody
            activePage={activePage}
            onNavigate={navigate}
            salesNavOpen={salesNavOpen}
            ordersNavOpen={ordersNavOpen}
            productNavOpen={productNavOpen}
            settingsNavOpen={settingsNavOpen}
            setSalesNavOpen={setSalesNavOpen}
            setOrdersNavOpen={setOrdersNavOpen}
            setProductNavOpen={setProductNavOpen}
            setSettingsNavOpen={setSettingsNavOpen}
            isDarkTheme={isDarkTheme}
            themeToggleLabel={themeToggleLabel}
            toggleTheme={toggleTheme}
            profileInitial={profileInitial}
            workspaceLabel={workspaceLabel}
            userLabel={userLabel}
            t={t}
          />
        ) : null}

        {sidebarCollapsed && popoverHovered ? (
          <div className={styles.sidebarPopover} role="dialog" aria-label="供应商后台导航">
            <div className={styles.sidebarPopoverBrand}>
              <MekyroLogo
                alt="Mekyro"
                className={styles.brandLogo}
                height={25}
                priority
                surface={isDarkTheme ? "dark" : "light"}
                width={112}
              />
            </div>
            <SupplierSidebarBody
              activePage={activePage}
              onNavigate={navigate}
              salesNavOpen={salesNavOpen}
              ordersNavOpen={ordersNavOpen}
              productNavOpen={false}
              settingsNavOpen={false}
              setSalesNavOpen={setSalesNavOpen}
              setOrdersNavOpen={setOrdersNavOpen}
              setProductNavOpen={setProductNavOpen}
              setSettingsNavOpen={setSettingsNavOpen}
              isDarkTheme={isDarkTheme}
              themeToggleLabel={themeToggleLabel}
              toggleTheme={toggleTheme}
              profileInitial={profileInitial}
              workspaceLabel={workspaceLabel}
              userLabel={userLabel}
              t={t}
            />
          </div>
        ) : null}
      </aside>

      <section
        className={styles.workspace}
        aria-label="供应商后台工作区"
      >
        <div className={styles.mobileWorkspaceHeader}>
          <div className={styles.mobileWorkspaceIdentity}>
            <button
              type="button"
              className={styles.mobileBrandButton}
              aria-label={locale === "zh-CN" ? "返回供应商后台首页" : "Back to supplier home"}
              title={locale === "zh-CN" ? "返回供应商后台首页" : "Back to supplier home"}
              onClick={() => navigate("home")}
            >
              <MekyroLogo
                alt="Mekyro"
                className={styles.mobileBrandLogo}
                height={26}
                priority
                surface={isDarkTheme ? "dark" : "light"}
                width={116}
              />
            </button>
          </div>
          <div className={styles.mobileWorkspaceControls}>
            {assistantAvailable ? (
              <BorderGlow
                alwaysOn
                borderRadius={12}
                className={styles.mobileAssistantGlow}
                coneSpread={14}
                fillOpacity={0}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={styles.mobileAssistantAction}
                  aria-label={assistantActionLabel}
                  title={assistantActionLabel}
                  onClick={() => setAssistantOpen(true)}
                  aria-expanded={assistantOpen}
                >
                  <Sparkles data-icon="inline-start" aria-hidden="true" />
                  {assistantActionLabel}
                </Button>
              </BorderGlow>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`${styles.mobileHeaderButton} ${styles.languageAction}`}
              onClick={toggleLocale}
            >
              <Globe2 data-icon="inline-start" aria-hidden="true" />
              {locale === "zh-CN" ? t("common.languageZh") : t("common.languageEn")}
            </Button>
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className={styles.mobileMenuTrigger}
                aria-label={mobileMenuLabel}
                title={mobileMenuLabel}
                onClick={() => setMobileMenuOpen(true)}
              >
                <Menu />
                <span className={styles.srOnly}>{mobileMenuLabel}</span>
              </Button>
              <SheetContent side="bottom" className={styles.mobileNavSheet}>
                <SheetHeader className={styles.mobileSheetHeader}>
                  <span className={styles.mobileSheetHandle} aria-hidden="true" />
                  <SheetTitle className={styles.srOnly}>{mobileMenuLabel}</SheetTitle>
                  <div className={styles.mobileSheetMeta}>
                    <strong>{workspaceLabel}</strong>
                    <span>{userLabel}</span>
                  </div>
                </SheetHeader>

                <nav className={styles.mobileSheetNavigation} aria-label={mobileNavLabel}>
                  <div className={styles.mobileNavGrid}>
                    {[...topNavigation, ...leadNavigation, ...orderNavigation, ...productNavigation].map((item) => {
                      const Icon = item.icon;
                      const selected =
                        activePage === item.id ||
                        ((activePage === "chat" || activePage === "todo-items") && item.id === "home");

                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={selected ? styles.mobileNavItemActive : styles.mobileNavItem}
                          aria-current={selected ? "page" : undefined}
                          onClick={() => navigateFromMobile(item.id)}
                        >
                          <Icon size={18} aria-hidden="true" />
                          <span>{t(item.label)}</span>
                        </button>
                      );
                    })}
                  </div>
                </nav>

                <Separator className={styles.mobileSheetSeparator} />

                <div className={styles.mobileSheetActions} aria-label="移动端全站操作">
                  {isSuperuser ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={styles.mobileSheetAction}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        goTo("/ops");
                      }}
                    >
                      <Settings data-icon="inline-start" aria-hidden="true" />
                      {t("common.opsManagement")}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={styles.mobileSheetAction}
                    onClick={() => window.open("/", "_blank")}
                  >
                    <ExternalLink data-icon="inline-start" aria-hidden="true" />
                    {t("common.openOfficialSite")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={styles.mobileSheetAction}
                    onClick={() => toggleTheme()}
                  >
                    {isDarkTheme ? (
                      <Sun data-icon="inline-start" aria-hidden="true" />
                    ) : (
                      <Moon data-icon="inline-start" aria-hidden="true" />
                    )}
                    {themeToggleLabel}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={styles.mobileSheetAction}
                    onClick={handleLogout}
                  >
                    <LogOut data-icon="inline-start" aria-hidden="true" />
                    {t("common.logout")}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <div className={styles.workspaceTopbar}>
          <div className={styles.workspaceActions} aria-label={t("common.siteActions")}>
            {assistantAvailable ? (
              <BorderGlow
                alwaysOn
                borderRadius={10}
                className={styles.assistantGlow}
                coneSpread={14}
                fillOpacity={0}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={styles.assistantTopbarAction}
                  onClick={() => setAssistantOpen(true)}
                  aria-expanded={assistantOpen}
                >
                  <Sparkles data-icon="inline-start" aria-hidden="true" />
                  {assistantTitle}
                </Button>
              </BorderGlow>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={styles.languageAction}
              onClick={toggleLocale}
            >
              <Globe2 data-icon="inline-start" aria-hidden="true" />
              {locale === "zh-CN" ? t("common.languageZh") : t("common.languageEn")}
            </Button>
            <SupplierAccountMenu
              isSuperuser={isSuperuser}
              onEnterOps={() => goTo("/ops")}
              onOpenOfficialSite={() => window.open("/", "_blank")}
              onLogout={handleLogout}
              t={t}
            />
          </div>
        </div>
        <SupplierCommandSurface
          activePage={activePage}
          chatReturnPage={chatReturnPage}
          activeTodoId={activeTodoId}
          onNavigate={navigate}
          onOpenChat={openChat}
          assistantOpen={assistantOpen}
          onAssistantOpenChange={setAssistantOpen}
        />
        <footer className={styles.workspaceFooter}>
          <span>© {footerYear} Mekyro</span>
          <div className={styles.workspaceFooterLinks}>
            <span>{t("supplier.workspaceFooterNote")}</span>
            <SiteViewModeToggle className={styles.workspaceFooterAction} locale={locale} />
          </div>
        </footer>
      </section>
    </main>
  );
}
