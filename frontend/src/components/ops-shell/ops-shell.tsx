import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MekyroLogo } from "@/components/mekyro-logo";
import {
  ArrowLeft,
  BarChart3,
  CircleUserRound,
  ChevronDown,
  ExternalLink,
  Globe2,
  Home,
  Key,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ClipboardList,
  ShoppingBag,
  Settings,
  Store,
  Sun,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocale } from "@/hooks/use-locale";
import { api, type ApiResponse } from "@/lib/api";
import { TOKEN_COOKIE_NAME } from "@/lib/auth/core";
import { onboardingSessionStore } from "@/lib/agent/onboarding-session-store";
import { useTheme } from "@/hooks/use-theme";
import { SiteViewModeToggle } from "@/components/site-view-mode-toggle";
import type { OfficialViewportMode } from "@/lib/official-site/content";
import { Avatar, AvatarBadge, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import styles from "./ops-shell.module.css";
import { ApiKeysPage } from "./api-keys-page";
import { LeadsPage } from "./leads-page";
import { ContactLogsPage } from "./contact-logs-page";
import { ProductsPage } from "./products-page";
import { InventoryLogsPage } from "./inventory-logs-page";
import { SupplierManagementPage } from "./supplier-management-page";
import { InquiriesPage } from "./inquiries-page";
import { OpsHomeDashboard } from "./ops-home-dashboard";
import {
  WorkspaceProvider,
  useWorkspace,
  type WorkspaceOption,
} from "./workspace-context";

type OpsPageId =
  | "home"
  | "supplier-management"
  | "api-keys"
  | "leads"
  | "contact-logs"
  | "supplier-inquiries"
  | "buyer-inquiries"
  | "products"
  | "inventory-logs";

type OpsShellProps = {
  initialScreen?: string | null;
  viewMode?: OfficialViewportMode;
};

const opsPages = [
  "home",
  "supplier-management",
  "api-keys",
  "leads",
  "contact-logs",
  "supplier-inquiries",
  "buyer-inquiries",
  "products",
  "inventory-logs",
] as const satisfies readonly OpsPageId[];

const supplierScopedPages: ReadonlySet<OpsPageId> = new Set<OpsPageId>([
  "leads",
  "contact-logs",
  "products",
  "inventory-logs",
]);

function isSupplierScopedPage(page: OpsPageId) {
  return supplierScopedPages.has(page);
}

const topNavigation: readonly { id: OpsPageId; label: string; icon: typeof Home }[] = [
  { id: "home", label: "opsNav.home", icon: Home },
];

const salesNavigation: readonly { id: OpsPageId; label: string; icon: typeof Home }[] = [
  { id: "leads", label: "opsNav.leads", icon: UserRound },
  { id: "contact-logs", label: "opsNav.contactLogs", icon: MessageSquare },
];

const productNavigation: readonly { id: OpsPageId; label: string; icon: typeof Home }[] = [
  { id: "products", label: "opsNav.products", icon: Package },
  { id: "inventory-logs", label: "opsNav.inventoryLogs", icon: ClipboardList },
];

const inquiryNavigation: readonly { id: OpsPageId; label: string; icon: typeof Home }[] = [
  { id: "supplier-inquiries", label: "opsNav.supplierInquiries", icon: Store },
  { id: "buyer-inquiries", label: "opsNav.buyerInquiries", icon: ShoppingBag },
];

const supplierNavigation: readonly { id: OpsPageId; label: string; icon: typeof Home }[] = [
  { id: "supplier-management", label: "opsNav.supplierManagement", icon: UserRound },
];

const settingsNavigation: readonly { id: OpsPageId; label: string; icon: typeof Home }[] = [
  { id: "api-keys", label: "opsNav.apiKeys", icon: Key },
];

const mobileNavigation = [
  ...topNavigation,
  ...salesNavigation,
  ...productNavigation,
  ...inquiryNavigation,
  ...supplierNavigation,
  ...settingsNavigation,
] as const;

function isOpsPageId(value: string | null | undefined): value is OpsPageId {
  return opsPages.includes(value as OpsPageId);
}

type OpsWorkspaceMenuProps = {
  activePage: OpsPageId;
  workspaces: WorkspaceOption[];
  selectedWorkspaceId: string;
  onReturnGlobal: () => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onOpenChange?: (open: boolean) => void;
  placement?: "sidebar" | "topbar";
  t: ReturnType<typeof useTranslation>["t"];
};

function OpsWorkspaceMenu({
  activePage,
  workspaces,
  selectedWorkspaceId,
  onReturnGlobal,
  onSelectWorkspace,
  onOpenChange,
  placement = "sidebar",
  t,
}: OpsWorkspaceMenuProps) {
  const selectedWorkspace = workspaces.find(
    (workspace) => String(workspace.workspace_id) === selectedWorkspaceId,
  );
  const triggerLabel = isSupplierScopedPage(activePage)
    ? selectedWorkspace?.workspace_name ?? t("ops.workspaceEntry")
    : t("ops.workspaceEntry");

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={(
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={placement === "topbar" ? styles.topbarWorkspaceTrigger : styles.sidebarWorkspaceTrigger}
            aria-label={t("ops.selectSupplierWorkspace")}
          />
        )}
      >
        <span>{triggerLabel}</span>
        <ChevronDown data-icon="inline-end" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className={styles.sidebarWorkspaceMenu} align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("ops.scopeGlobalView")}</DropdownMenuLabel>
          <DropdownMenuItem onClick={onReturnGlobal}>
            <Home aria-hidden="true" />
            {t("ops.scopeAllSuppliers")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("ops.scopeSupplierWorkspace")}</DropdownMenuLabel>
          {workspaces.map((workspace) => (
            <DropdownMenuItem
              key={workspace.workspace_id}
              onClick={() => onSelectWorkspace(String(workspace.workspace_id))}
            >
              <Store aria-hidden="true" />
              {workspace.workspace_name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type OpsAccountMenuProps = {
  onEnterSupplier: () => void;
  onOpenOfficialSite: () => void;
  onLogout: () => void;
  t: ReturnType<typeof useTranslation>["t"];
};

function OpsAccountMenu({
  onEnterSupplier,
  onOpenOfficialSite,
  onLogout,
  t,
}: OpsAccountMenuProps) {
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
          <DropdownMenuItem onClick={onEnterSupplier}>
            <ArrowLeft aria-hidden="true" />
            {t("ops.enterSupplierBackend")}
          </DropdownMenuItem>
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

type SidebarBodyProps = {
  activePage: OpsPageId;
  onNavigate: (page: OpsPageId) => void;
  salesNavOpen: boolean;
  productNavOpen: boolean;
  inquiryNavOpen: boolean;
  settingsNavOpen: boolean;
  setSalesNavOpen: (open: boolean) => void;
  setProductNavOpen: (open: boolean) => void;
  setInquiryNavOpen: (open: boolean) => void;
  setSettingsNavOpen: (open: boolean) => void;
  isDarkTheme: boolean;
  themeToggleLabel: string;
  toggleTheme: () => void;
  profileInitial: string;
  profileLabel: string;
  t: ReturnType<typeof useTranslation>["t"];
};

function SidebarBody(props: SidebarBodyProps) {
  const {
    activePage,
    onNavigate,
    salesNavOpen,
    productNavOpen,
    inquiryNavOpen,
    settingsNavOpen,
    setSalesNavOpen,
    setProductNavOpen,
    setInquiryNavOpen,
    setSettingsNavOpen,
    isDarkTheme,
    themeToggleLabel,
    toggleTheme,
    profileInitial,
    profileLabel,
    t,
  } = props;
  const salesNavActive = salesNavigation.some((item) => item.id === activePage);
  const productNavActive = productNavigation.some((item) => item.id === activePage);
  const inquiryNavActive = inquiryNavigation.some((item) => item.id === activePage);
  const settingsNavActive = settingsNavigation.some((item) => item.id === activePage);
  const themeControlLabel = t("common.darkMode");
  const themeSwitchId = "ops-theme-switch";

  return (
    <>
      <nav className={styles.navigation}>
        <div className={styles.navItems}>
          {topNavigation.map((item) => {
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
            <BarChart3 size={18} aria-hidden="true" />
            <span>{t("opsNav.salesGroup")}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent className={styles.navChildren}>
            {salesNavigation.map((item) => {
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
            <span>{t("opsNav.productGroup")}</span>
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
          className={inquiryNavOpen ? styles.navGroupOpen : styles.navGroup}
          open={inquiryNavOpen}
          onOpenChange={setInquiryNavOpen}
        >
          <CollapsibleTrigger
            className={`${styles.navParent} ${inquiryNavActive ? styles.navParentActive : ""}`}
            type="button"
          >
            <span className={styles.navAccent} aria-hidden="true" />
            <Globe2 size={18} aria-hidden="true" />
            <span>{t("opsNav.inquiryGroup")}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent className={styles.navChildren}>
            {inquiryNavigation.map((item) => {
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

        <div className={styles.navItems}>
          {supplierNavigation.map((item) => {
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
        </div>

        <Collapsible
          className={settingsNavOpen ? styles.navGroupOpen : styles.navGroup}
          open={settingsNavOpen}
          onOpenChange={setSettingsNavOpen}
        >
          <CollapsibleTrigger
            className={`${styles.navParent} ${settingsNavActive ? styles.navParentActive : ""}`}
            type="button"
          >
            <span className={styles.navAccent} aria-hidden="true" />
            <Settings size={18} aria-hidden="true" />
            <span>{t("opsNav.settingsGroup")}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent className={styles.navChildren}>
            {settingsNavigation.map((item) => {
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

      <div className={styles.sidebarProfile} aria-label="当前运营管理员信息">
        <Avatar className={styles.sidebarProfileAvatar} size="default">
          <AvatarFallback className={styles.sidebarProfileFallback}>
            {profileInitial}
          </AvatarFallback>
          <AvatarBadge className={styles.sidebarProfileBadge} />
        </Avatar>
        <div className={styles.sidebarProfileText}>
          <span>{t("opsNav.profileTitle")}</span>
          <strong>{profileLabel}</strong>
        </div>
      </div>
    </>
  );
}

function OpsShellInner({ initialScreen, viewMode = "auto" }: OpsShellProps) {
  const { t } = useTranslation();
  const { locale, toggleLocale } = useLocale();
  const { workspaces, selectedWorkspaceId, setSelectedWorkspaceId } = useWorkspace();
  const initialPage: OpsPageId = isOpsPageId(initialScreen) ? initialScreen : "home";
  const [activePage, setActivePage] = useState<OpsPageId>(initialPage);
  const [salesNavOpen, setSalesNavOpen] = useState(() =>
    salesNavigation.some((item) => item.id === initialPage),
  );
  const [productNavOpen, setProductNavOpen] = useState(() =>
    productNavigation.some((item) => item.id === initialPage),
  );
  const [inquiryNavOpen, setInquiryNavOpen] = useState(() =>
    inquiryNavigation.some((item) => item.id === initialPage),
  );
  const [settingsNavOpen, setSettingsNavOpen] = useState(() =>
    settingsNavigation.some((item) => item.id === initialPage),
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [popoverHovered, setPopoverHovered] = useState(false);
  const hoverOpenTimer = useRef<number | undefined>(undefined);
  const hoverCloseTimer = useRef<number | undefined>(undefined);
  const workspaceMenuOpenRef = useRef(false);
  const sidebarPointerInsideRef = useRef(false);
  const { resolvedTheme, toggle: toggleTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";
  const themeToggleLabel = isDarkTheme ? t("common.lightMode") : t("common.darkMode");
  const profileLabel = userName || (locale === "zh-CN" ? "运营管理员" : "Ops admin");
  const profileInitial = profileLabel.trim().slice(0, 1).toUpperCase();
  const footerYear = new Date().getFullYear();
  const mobileMenuLabel = locale === "zh-CN" ? "菜单" : "Menu";
  const mobileNavLabel = locale === "zh-CN" ? "运营后台导航" : "Operations navigation";
  const salesNavActive = salesNavigation.some((item) => item.id === activePage);
  const productNavActive = productNavigation.some((item) => item.id === activePage);
  const inquiryNavActive = inquiryNavigation.some((item) => item.id === activePage);
  const settingsNavActive = settingsNavigation.some((item) => item.id === activePage);
  const goTo = useNavigate();

  useEffect(() => {
    const stored = sessionStorage.getItem("user");
    if (stored) {
      try {
        const user = JSON.parse(stored);
        setUserName(user.nickname || user.username || "");
        return;
      } catch {
        sessionStorage.removeItem("user");
      }
    }

    api<ApiResponse<{ nickname?: string; username?: string }>>("/api/user/info/")
      .then((data) => {
        if (data?.code !== 200 || !data.data) return;
        const user = data.data;
        sessionStorage.setItem("user", JSON.stringify(user));
        setUserName(user.nickname || user.username || "");
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
    if (salesNavActive) {
      setSalesNavOpen(true);
    }
    if (productNavActive) {
      setProductNavOpen(true);
    }
    if (inquiryNavActive) {
      setInquiryNavOpen(true);
    }
    if (settingsNavActive) {
      setSettingsNavOpen(true);
    }
  }, [inquiryNavActive, productNavActive, salesNavActive, settingsNavActive]);

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage.getItem("ops:sidebar-collapsed") === "true") {
        setSidebarCollapsed(true);
      }
    } catch {
      /* localStorage 不可用时忽略 */
    }
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("ops:sidebar-collapsed", String(sidebarCollapsed));
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

  useEffect(() => {
    if (!popoverHovered) {
      workspaceMenuOpenRef.current = false;
    }
  }, [popoverHovered]);

  const handleSidebarEnter = useCallback(() => {
    sidebarPointerInsideRef.current = true;
    if (!sidebarCollapsed) return;
    window.clearTimeout(hoverCloseTimer.current);
    hoverOpenTimer.current = window.setTimeout(() => setPopoverHovered(true), 100);
  }, [sidebarCollapsed]);

  const handleSidebarLeave = useCallback(() => {
    sidebarPointerInsideRef.current = false;
    if (!sidebarCollapsed) return;
    window.clearTimeout(hoverOpenTimer.current);
    hoverCloseTimer.current = window.setTimeout(() => {
      if (!workspaceMenuOpenRef.current && !sidebarPointerInsideRef.current) {
        setPopoverHovered(false);
      }
    }, 200);
  }, [sidebarCollapsed]);

  const handleWorkspaceMenuOpenChange = useCallback((open: boolean) => {
    workspaceMenuOpenRef.current = open;
    window.clearTimeout(hoverCloseTimer.current);

    if (!open && !sidebarPointerInsideRef.current) {
      hoverCloseTimer.current = window.setTimeout(() => {
        if (!workspaceMenuOpenRef.current && !sidebarPointerInsideRef.current) {
          setPopoverHovered(false);
        }
      }, 200);
    }
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((v) => !v);
    setPopoverHovered(false);
  }, []);

  function navigate(page: OpsPageId) {
    setActivePage(page);
    setPopoverHovered(false);
    const url = new URL(window.location.href);
    url.searchParams.set("screen", page);
    goTo({ pathname: "/ops", search: url.searchParams.toString() }, { replace: true });
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0 }));
  }

  const handleReturnGlobal = useCallback(() => {
    navigate("home");
  }, []);

  const handleSelectWorkspace = useCallback((workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId);
    navigate("leads");
  }, [setSelectedWorkspaceId]);

  function navigateFromMobile(page: OpsPageId) {
    setMobileMenuOpen(false);
    navigate(page);
  }

  return (
    <TooltipProvider>
    <main className={styles.opsShell} data-screen={activePage} data-surface="ops" data-view-mode={viewMode} data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}>
      <aside
        className={styles.sidebar}
        aria-label="运营管理导航"
        data-popover-open={sidebarCollapsed && popoverHovered ? "true" : "false"}
        onMouseEnter={handleSidebarEnter}
        onMouseLeave={handleSidebarLeave}
      >
        <div className={styles.sidebarBrand}>
          {!sidebarCollapsed ? (
            <button
              type="button"
              className={styles.brandButton}
              aria-label={locale === "zh-CN" ? "返回运营后台首页" : "Back to operations home"}
              title={locale === "zh-CN" ? "返回运营后台首页" : "Back to operations home"}
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
          <>
            <SidebarBody
              activePage={activePage}
              onNavigate={navigate}
              salesNavOpen={salesNavOpen}
              productNavOpen={productNavOpen}
              inquiryNavOpen={inquiryNavOpen}
              settingsNavOpen={settingsNavOpen}
              setSalesNavOpen={setSalesNavOpen}
              setProductNavOpen={setProductNavOpen}
              setInquiryNavOpen={setInquiryNavOpen}
              setSettingsNavOpen={setSettingsNavOpen}
              isDarkTheme={isDarkTheme}
              themeToggleLabel={themeToggleLabel}
              toggleTheme={toggleTheme}
              profileInitial={profileInitial}
              profileLabel={profileLabel}
              t={t}
            />
          </>
        ) : null}

        {sidebarCollapsed && popoverHovered ? (
          <div className={styles.sidebarPopover} role="dialog" aria-label="运营管理导航">
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
            <SidebarBody
              activePage={activePage}
              onNavigate={navigate}
              salesNavOpen={salesNavOpen}
              productNavOpen={productNavOpen}
              inquiryNavOpen={inquiryNavOpen}
              settingsNavOpen={settingsNavOpen}
              setSalesNavOpen={setSalesNavOpen}
              setProductNavOpen={setProductNavOpen}
              setInquiryNavOpen={setInquiryNavOpen}
              setSettingsNavOpen={setSettingsNavOpen}
              isDarkTheme={isDarkTheme}
              themeToggleLabel={themeToggleLabel}
              toggleTheme={toggleTheme}
              profileInitial={profileInitial}
              profileLabel={profileLabel}
              t={t}
            />
          </div>
        ) : null}
      </aside>

      <section className={styles.workspace} aria-label="运营管理工作区">
        <div className={styles.mobileWorkspaceHeader}>
          <div className={styles.mobileWorkspaceIdentity}>
            <button
              type="button"
              className={styles.mobileBrandButton}
              aria-label={locale === "zh-CN" ? "返回运营后台首页" : "Back to operations home"}
              title={locale === "zh-CN" ? "返回运营后台首页" : "Back to operations home"}
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
                    <strong>{t("opsNav.profileTitle")}</strong>
                    <span>{profileLabel}</span>
                  </div>
                </SheetHeader>

                <OpsWorkspaceMenu
                  activePage={activePage}
                  workspaces={workspaces}
                  selectedWorkspaceId={selectedWorkspaceId}
                  onReturnGlobal={() => {
                    setMobileMenuOpen(false);
                    handleReturnGlobal();
                  }}
                  onSelectWorkspace={(workspaceId) => {
                    setMobileMenuOpen(false);
                    handleSelectWorkspace(workspaceId);
                  }}
                  t={t}
                />

                <nav className={styles.mobileSheetNavigation} aria-label={mobileNavLabel}>
                  <div className={styles.mobileNavGrid}>
                    {mobileNavigation.map((item) => {
                      const Icon = item.icon;
                      const selected = activePage === item.id;

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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={styles.mobileSheetAction}
                    onClick={() => {
                      setMobileMenuOpen(false);
                      goTo("/supplier");
                    }}
                  >
                    <ArrowLeft data-icon="inline-start" aria-hidden="true" />
                    {t("ops.enterSupplierBackend")}
                  </Button>
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
          <div className={styles.globalShellBar}>
            <OpsWorkspaceMenu
              activePage={activePage}
              workspaces={workspaces}
              selectedWorkspaceId={selectedWorkspaceId}
              onReturnGlobal={handleReturnGlobal}
              onSelectWorkspace={handleSelectWorkspace}
              onOpenChange={handleWorkspaceMenuOpenChange}
              placement="topbar"
              t={t}
            />
            <div className={styles.globalShellActions} aria-label={t("common.siteActions")}>
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
              <OpsAccountMenu
                onEnterSupplier={() => goTo("/supplier")}
                onOpenOfficialSite={() => window.open("/", "_blank")}
                onLogout={handleLogout}
                t={t}
              />
            </div>
          </div>
        </div>

        <div className={styles.surfacePanel}>
          {activePage === "home" ? (
            <OpsHomeDashboard onNavigate={navigate} />
          ) : null}

          {activePage === "supplier-management" ? (
            <SupplierManagementPage />
          ) : null}

          {activePage === "api-keys" ? (
            <ApiKeysPage />
          ) : null}

          {activePage === "leads" ? (
            <LeadsPage />
          ) : null}

          {activePage === "contact-logs" ? (
            <ContactLogsPage />
          ) : null}

          {activePage === "supplier-inquiries" ? (
            <InquiriesPage kind="supplier" />
          ) : null}

          {activePage === "buyer-inquiries" ? (
            <InquiriesPage kind="buyer" />
          ) : null}

          {activePage === "products" ? (
            <ProductsPage />
          ) : null}

          {activePage === "inventory-logs" ? (
            <InventoryLogsPage />
          ) : null}
        </div>

        <footer className={styles.workspaceFooter}>
          <span>© {footerYear} Mekyro</span>
          <div className={styles.workspaceFooterLinks}>
            <span>Powered by Monkey Memory</span>
            <SiteViewModeToggle className={styles.workspaceFooterAction} locale={locale} />
          </div>
        </footer>
      </section>
    </main>
    </TooltipProvider>
  );
}

export function OpsShell(props: OpsShellProps) {
  return (
    <WorkspaceProvider>
      <OpsShellInner {...props} />
    </WorkspaceProvider>
  );
}
