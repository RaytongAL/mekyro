import { Link } from "react-router-dom";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  Clock3,
  EyeOff,
  Factory,
  Globe2,
  Languages,
  LockKeyhole,
  Mail,
  MapPin,
  Menu,
  MessageSquareText,
  RefreshCw,
  Route,
  Store,
  TrendingDown,
  Workflow,
  X,
  UserRoundX,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { OfficialContactNavMenu } from "@/components/official-contact-nav-menu";
import { OfficialRevealOnView } from "@/components/official-reveal-on-view";
import { SideRays } from "@/components/official-side-rays";
import { OfficialBorderGlow } from "@/components/official-border-glow";
import { OfficialNoise } from "@/components/official-noise";
import { OfficialSplitText } from "@/components/official-split-text";
import { OfficialTextType } from "@/components/official-text-type";
import { SupplierTwoShowcase } from "@/components/supplier-two-showcase";
import { MekyroLogo } from "@/components/mekyro-logo";
import { InquiryForm } from "@/components/inquiry-form";
import { LoginForm } from "@/components/login-form";
import { SmsLoginForm } from "@/components/sms-login-form";
import { EmailLoginForm } from "@/components/email-login-form";
import { SiteViewModeToggle } from "@/components/site-view-mode-toggle";
import { officialCopy, type OfficialLocale, type OfficialPage, type OfficialViewportMode } from "@/lib/official-site/content";
import { useSiteViewMode } from "@/hooks/use-site-view-mode";

type OfficialPageProps = {
  locale: OfficialLocale;
};

type OfficialHomePageProps = OfficialPageProps & {
  viewMode?: OfficialViewportMode;
};

type Row = readonly [string, string];
type CapabilityTone = "accent" | "dark" | "light";
type CapabilitySignal = {
  icon: LucideIcon;
  label: string;
};
type CapabilityCard = {
  signals: CapabilitySignal[];
  title: string;
  tone: CapabilityTone;
};
type MobileCapabilityLayer = {
  icon: LucideIcon;
  summary: string;
  title: string;
};

const pagePaths: Record<OfficialPage, string> = {
  home: "/",
  about: "/about",
  aboutContact: "/about/contact",
  login: "/login",
  opsEntry: "/ops-entry",
  contact: "/contact",
  contactBuyer: "/contact/buyer",
  security: "/security",
  pricing: "/pricing",
  faq: "/faq",
};

const previewIcons: LucideIcon[] = [MessageSquareText, Brain, Bot, Workflow];
const processIcons: LucideIcon[] = [MessageSquareText, Route, Bot, CheckCircle2, Brain, LockKeyhole];
const painIcons: LucideIcon[] = [TrendingDown, UserRoundX, Clock3, Languages, EyeOff, RefreshCw];
const pricingFeatureIcons: LucideIcon[] = [TrendingDown, Factory, RefreshCw];
const aboutContactIcons: LucideIcon[] = [Clock3, MapPin, Globe2, Mail];
const mobilePainSummaries: Record<OfficialLocale, readonly string[]> = {
  "zh-CN": [
    "线索跟进断档，客户热度快速流失。",
    "客户语境跟着人走，团队反复重来。",
    "关键问题无人响应，订单窗口被错过。",
    "多渠道多语言混杂，人工处理不稳定。",
    "只看结果，看不见客户卡在哪里。",
    "成功经验没有沉淀，下一单难以复用。",
  ],
  "en-US": [
    "Follow-up breaks and warm leads cool down.",
    "Context leaves with reps, so teams restart.",
    "Timezone gaps miss the buying window.",
    "Channels and languages create unstable handling.",
    "Managers see outcomes, not deal blockers.",
    "Wins do not compound into the next deal.",
  ],
};

function withLocale(path: string, locale: OfficialLocale) {
  const [basePath, hash] = path.split("#");
  return `${basePath}?locale=${locale}${hash ? `#${hash}` : ""}`;
}

function alternateLocale(locale: OfficialLocale): OfficialLocale {
  return locale === "zh-CN" ? "en-US" : "zh-CN";
}

function OfficialShell({
  active,
  children,
  locale,
}: {
  active: OfficialPage;
  children: ReactNode;
  locale: OfficialLocale;
}) {
  const { viewMode } = useSiteViewMode();
  const showShellNav = active !== "home";

  return (
    <main className={`official-site${active === "home" ? " official-site-home" : ""}`} data-locale={locale} data-view-mode={viewMode}>
      {showShellNav ? <OfficialMobileNav active={active} locale={locale} viewMode={viewMode} /> : null}
      {showShellNav ? <OfficialDesktopNav active={active} locale={locale} /> : null}
      {children}
      <OfficialFooter locale={locale} />
    </main>
  );
}

function OfficialDesktopNav({ active, className, locale }: { active: OfficialPage; className?: string; locale: OfficialLocale }) {
  const copy = officialCopy[locale];
  const nextLocale = alternateLocale(locale);
  const hrefFor = (path: string) => withLocale(path, locale);

  return (
    <header className={`official-nav${className ? ` ${className}` : ""}`}>
      <SideRays
        className="official-nav-rays"
        rayColor1="#c5e803"
        rayColor2="#f7ffe8"
        intensity={1.35}
        spread={1.18}
        speed={1.9}
        saturation={1.15}
        blend={0.62}
        falloff={1.75}
        opacity={0.46}
      />
      <Link className="official-brand" to={hrefFor("/")} aria-label={copy.common.brand}>
        <MekyroLogo className="official-logo" alt={copy.common.brand} width={160} height={40} priority />
      </Link>
      <nav className="official-nav-links" aria-label="Mekyro official site">
        <Link className={active === "home" ? "is-active" : ""} to={hrefFor("/")}>
          {copy.nav.home}
        </Link>
        <OfficialContactNavMenu
          active={active === "pricing" || active === "faq" || active === "contact" || active === "contactBuyer"}
          label={copy.nav.product}
          items={[
            { href: hrefFor("/pricing"), label: copy.nav.pricing },
            { href: hrefFor("/faq"), label: copy.nav.faq },
            { href: hrefFor("/contact"), label: copy.nav.contactSupplier },
            { href: hrefFor("/contact/buyer"), label: copy.nav.contactBuyer },
          ]}
        />
        <OfficialContactNavMenu
          active={active === "about" || active === "aboutContact"}
          label={copy.nav.about}
          items={[
            { href: hrefFor("/about"), label: copy.nav.aboutOverview },
            { href: hrefFor("/about/contact"), label: copy.nav.contactUs },
          ]}
        />
      </nav>
      <div className="official-nav-actions">
        <Link className="official-button official-button-quiet" to={hrefFor("/login")}>
          <LockKeyhole size={15} />
          <span>{copy.nav.login}</span>
        </Link>
        <Link className="official-button official-button-primary" to={hrefFor("/contact")}>
          <span>{copy.common.primaryCta}</span>
          <ArrowRight size={15} />
        </Link>
        <Link className="official-lang" to={withLocale(pagePaths[active], nextLocale)} aria-label={copy.common.languageLabel}>
          {copy.alternateLocaleName}
        </Link>
      </div>
    </header>
  );
}

function OfficialMobileShell({
  children,
  locale,
  viewMode,
}: {
  children: ReactNode;
  locale: OfficialLocale;
  viewMode: OfficialViewportMode;
}) {
  return (
    <main className="official-site official-site-home official-site-mobile" data-locale={locale} data-view-mode={viewMode}>
      {children}
      <OfficialFooter locale={locale} />
    </main>
  );
}

function OfficialMobileNav({
  active,
  className,
  locale,
  viewMode,
}: {
  active: OfficialPage;
  className?: string;
  locale: OfficialLocale;
  viewMode: OfficialViewportMode;
}) {
  const copy = officialCopy[locale];
  const nextLocale = alternateLocale(locale);
  const hrefFor = (path: string) => withLocale(path, locale);
  const menuLabel = locale === "zh-CN" ? "菜单" : "Menu";
  const navGroups = [
    {
      links: [[copy.nav.home, "/"]],
      title: "",
    },
    {
      links: [
        [copy.nav.pricing, "/pricing"],
        [copy.nav.faq, "/faq"],
        [copy.nav.contactSupplier, "/contact"],
        [copy.nav.contactBuyer, "/contact/buyer"],
      ],
      title: copy.nav.product,
    },
    {
      links: [
        [copy.nav.aboutOverview, "/about"],
        [copy.nav.contactUs, "/about/contact"],
      ],
      title: copy.nav.about,
    },
  ] as const;

  return (
    <header className={`official-mobile-nav${className ? ` ${className}` : ""}`}>
      <SideRays
        className="official-nav-rays official-mobile-nav-rays"
        rayColor1="#c5e803"
        rayColor2="#f7ffe8"
        intensity={1.24}
        spread={1.12}
        speed={1.8}
        saturation={1.12}
        blend={0.62}
        falloff={1.75}
        opacity={0.42}
      />
      <Link className="official-mobile-brand" to={hrefFor("/")} aria-label={copy.common.brand}>
        <MekyroLogo className="official-mobile-logo" alt={copy.common.brand} width={112} height={28} priority />
      </Link>
      <div className="official-mobile-nav-actions">
        <Button
          variant="ghost"
          size="icon-lg"
          className="official-mobile-icon-button"
          nativeButton={false}
          aria-label={copy.common.languageLabel}
          title={copy.common.languageLabel}
          render={<Link to={withLocale(pagePaths[active], nextLocale)} />}
        >
          <Languages />
          <span className="official-sr-only">{copy.alternateLocaleName}</span>
        </Button>
        <Sheet>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                size="icon-lg"
                className="official-mobile-icon-button official-mobile-menu-trigger"
                aria-label={locale === "zh-CN" ? "打开菜单" : "Open menu"}
                title={menuLabel}
              />
            }
          >
            <Menu />
            <span className="official-sr-only">{menuLabel}</span>
          </SheetTrigger>
          <SheetContent side="right" showCloseButton={false} className="official-mobile-sheet">
            <SheetHeader className="official-mobile-sheet-header">
              <SheetTitle className="official-sr-only">{menuLabel}</SheetTitle>
              <SheetClose
                render={
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    className="official-mobile-sheet-close"
                    aria-label={locale === "zh-CN" ? "关闭菜单" : "Close menu"}
                  />
                }
              >
                <X />
              </SheetClose>
            </SheetHeader>
            <nav className="official-mobile-sheet-links" aria-label={locale === "zh-CN" ? "移动端官网导航" : "Mobile official site navigation"}>
              {navGroups.map((group) => (
                <div className="official-mobile-sheet-group" key={group.title || "primary"}>
                  {group.title ? <span className="official-mobile-sheet-group-title">{group.title}</span> : null}
                  {group.links.map(([label, path]) => (
                    <SheetClose key={`${group.title}-${label}`} nativeButton={false} render={<Link className="official-mobile-sheet-link" to={hrefFor(path)} />}>
                      <span>{label}</span>
                      <ArrowRight />
                    </SheetClose>
                  ))}
                </div>
              ))}
            </nav>
            <SheetClose nativeButton={false} render={<Link className="official-mobile-sheet-login" to={hrefFor("/login")} />}>
              <Store />
              <span>{copy.nav.login}</span>
            </SheetClose>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

function OfficialFooter({ locale }: { locale: OfficialLocale }) {
  const copy = officialCopy[locale];
  const footerGroups = [
    {
      title: copy.nav.home,
      links: [
        [copy.nav.home, "/"],
        [copy.common.primaryCta, "/contact"],
        [locale === "zh-CN" ? "供应商后台入口" : "Supplier backend entry", "/login"],
      ],
    },
    {
      title: copy.nav.product,
      links: [
        [copy.nav.pricing, "/pricing"],
        [copy.nav.faq, "/faq"],
        [copy.nav.contactSupplier, "/contact"],
        [copy.nav.contactBuyer, "/contact/buyer"],
      ],
    },
    {
      title: copy.nav.about,
      links: [
        [copy.nav.aboutOverview, "/about"],
        [copy.nav.contactUs, "/about/contact"],
      ],
    },
  ];

  return (
    <footer className="official-footer">
      <div className="official-footer-main">
        <div className="official-footer-brand-block">
          <Link to={withLocale("/", locale)} aria-label={copy.common.brand}>
            <MekyroLogo className="official-footer-logo" alt={copy.common.brand} width={192} height={48} surface="light" />
          </Link>
          <div className="official-footer-meta">
            <span>© 2026 Mekyro</span>
            <SiteViewModeToggle locale={locale} />
          </div>
        </div>
        <nav className="official-footer-link-grid" aria-label={locale === "zh-CN" ? "页脚导航" : "Footer navigation"}>
          {footerGroups.map((group) => (
            <div className="official-footer-group" key={group.title}>
              <h2>{group.title}</h2>
              <div>
                {group.links.map(([label, href]) => (
                  <Link to={withLocale(href, locale)} key={label}>
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>
      <OfficialFooterWordmark />
    </footer>
  );
}

function OfficialFooterWordmark() {
  const wordmarkRef = useRef<HTMLDivElement>(null);
  const revealMaskRef = useRef<SVGRadialGradientElement>(null);
  const uid = useId().replace(/:/g, "");
  const gradientId = `official-footer-wordmark-gradient-${uid}`;
  const revealGradientId = `official-footer-wordmark-reveal-${uid}`;
  const maskId = `official-footer-wordmark-mask-${uid}`;

  useEffect(() => {
    const node = wordmarkRef.current;
    if (!node) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      node.classList.add("is-visible");
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;

        node.classList.add("is-visible");
        observer.disconnect();
      },
      {
        rootMargin: "0px 0px -14% 0px",
        threshold: 0.28,
      },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const node = wordmarkRef.current;
    const revealMask = revealMaskRef.current;
    if (!node || !revealMask) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    let frameId = 0;
    let nextX = -18;
    let nextY = -62;

    const paintMask = () => {
      revealMask.setAttribute("cx", `${nextX}%`);
      revealMask.setAttribute("cy", `${nextY}%`);
      frameId = 0;
    };

    const queueMaskPaint = (x: number, y: number) => {
      nextX = x;
      nextY = y;

      if (!frameId) {
        frameId = window.requestAnimationFrame(paintMask);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));

      node.classList.add("is-pointer-active");
      queueMaskPaint(x, y);
    };

    const handlePointerLeave = () => {
      node.classList.remove("is-pointer-active");
      queueMaskPaint(-18, -62);
    };

    node.addEventListener("pointerenter", handlePointerMove);
    node.addEventListener("pointermove", handlePointerMove);
    node.addEventListener("pointerleave", handlePointerLeave);
    window.addEventListener("scroll", handlePointerLeave, { passive: true });

    return () => {
      node.removeEventListener("pointerenter", handlePointerMove);
      node.removeEventListener("pointermove", handlePointerMove);
      node.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("scroll", handlePointerLeave);

      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

  return (
    <div className="official-footer-wordmark" ref={wordmarkRef} aria-hidden="true">
      <svg viewBox="0 0 420 120" role="presentation" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(197, 232, 3, 0)" />
            <stop offset="36%" stopColor="rgba(197, 232, 3, 0.78)" />
            <stop offset="72%" stopColor="rgba(255, 255, 255, 0.82)" />
            <stop offset="100%" stopColor="rgba(197, 232, 3, 0)" />
          </linearGradient>
          <radialGradient id={revealGradientId} ref={revealMaskRef} cx="-18%" cy="-62%" r="24%" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="white" />
            <stop offset="38%" stopColor="rgba(255, 255, 255, 0.78)" />
            <stop offset="76%" stopColor="rgba(255, 255, 255, 0)" />
          </radialGradient>
          <mask id={maskId} maskUnits="userSpaceOnUse">
            <rect x="0" y="0" width="420" height="120" fill={`url(#${revealGradientId})`} />
          </mask>
        </defs>
        <text className="official-footer-wordmark-ghost" x="50%" y="61%" textAnchor="middle" dominantBaseline="middle">
          Mekyro
        </text>
        <text className="official-footer-wordmark-outline" x="50%" y="61%" textAnchor="middle" dominantBaseline="middle">
          Mekyro
        </text>
        <text
          className="official-footer-wordmark-highlight"
          x="50%"
          y="61%"
          textAnchor="middle"
          dominantBaseline="middle"
          stroke={`url(#${gradientId})`}
          mask={`url(#${maskId})`}
        >
          Mekyro
        </text>
      </svg>
    </div>
  );
}

function OfficialHero({
  actions,
  category,
  children,
  lead,
  splitBy = "character",
  nav,
  title,
}: {
  actions?: ReactNode;
  category: string;
  children?: ReactNode;
  lead: string;
  splitBy?: "character" | "word";
  nav?: ReactNode;
  title: string;
}) {
  const [leadPrimary, ...leadBodyLines] = lead.split("\n");

  return (
    <section className={`official-hero${children ? "" : " official-hero-minimal"}`}>
      {!children ? (
        <SideRays
          className="official-hero-side-rays"
          rayColor1="#c5e803"
          rayColor2="#f7ffe8"
          intensity={1.82}
          spread={1.72}
          speed={2.25}
          saturation={1.2}
          blend={0.66}
          falloff={1.58}
          opacity={0.84}
          tilt={-7}
        />
      ) : null}
      {nav ? <div className="official-hero-nav-slot">{nav}</div> : null}
      <div className="official-hero-copy">
        <h1>
          {title.split("\n").map((line, index) => (
            <OfficialSplitText className="official-hero-title-line" delayStepMs={index === 0 ? 48 : 40} key={line} splitBy={splitBy} text={line} />
          ))}
        </h1>
        {category ? <p className="official-category">{category}</p> : null}
        <p className="official-lead">
          {leadPrimary ? <OfficialSplitText className="official-lead-primary official-hero-kicker-line" delayStepMs={34} splitBy={splitBy} text={leadPrimary} /> : null}
          {leadBodyLines.length ? (
            <OfficialTextType
              className="official-hero-lead-type"
              deleteSpeedMs={82}
              initialDelayMs={900}
              pauseDurationMs={1900}
              restartDelayMs={620}
              text={leadBodyLines}
              typingSpeedMs={118}
            />
          ) : null}
        </p>
        {actions ? <div className="official-actions">{actions}</div> : null}
      </div>
      {children ? <aside className="official-system-preview">{children}</aside> : null}
    </section>
  );
}

function OfficialMobileHero({ locale, viewMode }: { locale: OfficialLocale; viewMode: OfficialViewportMode }) {
  const copy = officialCopy[locale];
  const [primaryLead, ...mobileLeadBodyLines] = copy.home.lead.split("\n");
  const splitBy = locale === "en-US" ? "word" : "character";
  const bodyLead =
    locale === "zh-CN"
      ? mobileLeadBodyLines.join("\n")
      : "From lead discovery to quotes, payment, and repeat orders, AI advances the work while people keep the risk gates.";

  return (
    <section className="official-mobile-hero">
      <OfficialMobileNav active="home" className="official-mobile-hero-nav" locale={locale} viewMode={viewMode} />
      <SideRays
        className="official-hero-side-rays official-mobile-hero-side-rays"
        rayColor1="#c5e803"
        rayColor2="#f7ffe8"
        intensity={1.48}
        spread={1.58}
        speed={2.05}
        saturation={1.16}
        blend={0.66}
        falloff={1.62}
        opacity={0.66}
        tilt={-6}
      />
      <div className="official-mobile-hero-copy">
        <h1>
          <OfficialSplitText className="official-mobile-hero-title-line" delayStepMs={48} splitBy={splitBy} text={copy.home.title} />
        </h1>
        <p className="official-mobile-lead">
          <OfficialSplitText className="official-mobile-lead-primary official-mobile-hero-kicker-line" delayStepMs={34} splitBy={splitBy} text={primaryLead} />
          <OfficialTextType
            className="official-mobile-lead-body official-mobile-lead-type"
            deleteSpeedMs={64}
            initialDelayMs={820}
            pauseDurationMs={1760}
            restartDelayMs={560}
            text={bodyLead.split("\n")}
            typingSpeedMs={96}
          />
        </p>
        <div className="official-mobile-actions">
          <Link className="official-button official-button-primary" to={withLocale("/contact", locale)}>
            <span>{copy.home.actions.primary}</span>
            <ArrowRight size={15} />
          </Link>
          <a className="official-button official-button-quiet" href="#mobile-supplier-showcase">
            <span>{copy.home.actions.secondary}</span>
          </a>
        </div>
      </div>
    </section>
  );
}

function PageHead({ accentTitle = false, lead, title }: { accentTitle?: boolean; lead?: string; title: string }) {
  return (
    <section className={`official-page-head${accentTitle ? " official-page-head-accent" : ""}`}>
      <h1>{title}</h1>
      {lead ? <p>{lead}</p> : null}
    </section>
  );
}

function SectionHead({ eyebrow, lead, title }: { eyebrow?: string; lead?: string; title: string }) {
  return (
    <div className={`official-section-head${eyebrow ? " official-section-head-stacked" : ""}`}>
      <div className="official-section-title-group">
        {eyebrow ? <span>{eyebrow}</span> : null}
        <h2>{title}</h2>
      </div>
      {lead ? <p>{lead}</p> : null}
    </div>
  );
}

function RowList({ className, rows }: { className?: string; rows: readonly Row[] }) {
  return (
    <div className={`official-row-list${className ? ` ${className}` : ""}`}>
      {rows.map(([title, text]) => (
        <article className="official-row" key={title}>
          <h3>{title}</h3>
          <p>{text}</p>
        </article>
      ))}
    </div>
  );
}

function DenseRows({ className, rows }: { className?: string; rows: readonly Row[] }) {
  return (
    <div className={`official-dense-rows${className ? ` ${className}` : ""}`}>
      {rows.map(([title, text]) => (
        <article key={title}>
          <strong>{title}</strong>
          <p>{text}</p>
        </article>
      ))}
    </div>
  );
}

function PricingDetailPanel({
  locale,
  rows,
}: {
  locale: OfficialLocale;
  rows: readonly Row[];
}) {
  const isChinese = locale === "zh-CN";
  const labels = isChinese
    ? {
        title: "即刻拥有 AI 销售团队",
        lead: "年费方案覆盖产品与知识初始化、工作空间配置、AI 销售推进和持续托管服务。",
        plan: "Mekyro 年费方案",
        planNote: "面向制造商和贸易商的 B2B 销售自动化托管服务。",
        discountBadge: "限时折扣价",
        currentPrice: "¥29,800",
        period: "/ 年",
        originalLabel: "原价",
        originalPrice: "¥98,000 / 年",
        included: "费用包含",
        includedItems: ["产品与知识初始化", "工作空间配置", "基础托管服务", "AI 销售推进", "线索到确认跟进", "付款履约跟进", "复购动作提醒", "持续知识沉淀"],
        cta: "申请托管",
      }
    : {
        title: "Own an AI sales team today",
        lead: "The annual plan covers product and knowledge initialization, workspace setup, AI sales execution, and managed operating support.",
        plan: "Mekyro annual plan",
        planNote: "B2B sales automation managed service for manufacturers and trading companies.",
        discountBadge: "Limited-time price",
        currentPrice: "¥29,800",
        period: "/ year",
        originalLabel: "Original",
        originalPrice: "¥98,000 / year",
        included: "Everything included",
        includedItems: ["Product and knowledge setup", "Workspace configuration", "Managed service baseline", "AI sales follow-up", "Lead to confirmation flow", "Payment and fulfillment tracking", "Reorder prompts", "Compounding knowledge base"],
        cta: "Apply for managed service",
      };

  return (
    <section className="official-section official-pricing-detail-section">
      <div className="official-pricing-detail-copy">
        <div className="official-pricing-detail-heading">
          <h1>{labels.title}</h1>
          <p>{labels.lead}</p>
        </div>
        <div className="official-pricing-feature-list">
          {rows.map(([title, text], index) => {
            const Icon = pricingFeatureIcons[index % pricingFeatureIcons.length];

            return (
              <article className="official-pricing-feature" key={title}>
                <span className="official-pricing-feature-icon" aria-hidden="true">
                  <Icon size={17} />
                </span>
                <div>
                  <h2>{title}</h2>
                  <p>{text}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <aside className="official-pricing-plan" aria-label={labels.plan}>
        <div className="official-pricing-plan-top">
          <h2>{labels.plan}</h2>
          <p>{labels.planNote}</p>
        </div>
        <div className="official-pricing-plan-price">
          <span className="official-pricing-discount-badge">{labels.discountBadge}</span>
          <div className="official-pricing-price-line">
            <strong>{labels.currentPrice}</strong>
            <span>{labels.period}</span>
          </div>
          <p className="official-pricing-original-price">
            <span>{labels.originalLabel}</span>
            <del>{labels.originalPrice}</del>
          </p>
        </div>
        <div className="official-pricing-plan-included">
          <span>{labels.included}</span>
          <ul>
            {labels.includedItems.map((item) => (
              <li key={item}>
                <CheckCircle2 size={16} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <Link className="official-button official-button-primary official-pricing-plan-cta" to={withLocale("/contact", locale)}>
          <span>{labels.cta}</span>
          <ArrowRight size={15} />
        </Link>
      </aside>
    </section>
  );
}

type AboutStackCardData = {
  paragraphs: readonly string[];
  rows: readonly Row[];
  title: string;
};

function PainBreakdown({ locale, rows }: { locale: OfficialLocale; rows: readonly Row[] }) {
  return (
    <div className="official-pain-map" aria-label={locale === "zh-CN" ? "传统运营漏单原因" : "Traditional operating leaks"}>
      {rows.map(([title, text], index) => {
        const Icon = painIcons[index % painIcons.length];
        return (
          <article className="official-pain-card official-pain-card-glass" key={title} tabIndex={0}>
            <div className="official-pain-card-inner">
              <div className="official-pain-face official-pain-face-front">
                <p className="official-pain-ghost" aria-hidden="true">{text}</p>
                <span className="official-pain-icon">
                  <Icon size={18} />
                </span>
                <strong className="official-pain-title">{title}</strong>
              </div>
              <div className="official-pain-face official-pain-face-back">
                <p>{text}</p>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function MobilePainDiagnostics({ locale, rows }: { locale: OfficialLocale; rows: readonly Row[] }) {
  const scanLabel = locale === "zh-CN" ? "销售问题扫描中" : "Scanning sales blockers";
  const summaryLabel = locale === "zh-CN" ? "AI 自动化接管这些断点" : "AI automation covers these breaks";
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isPlayingRef = useRef(false);
  const [animationRun, setAnimationRun] = useState(0);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.65 && !isPlayingRef.current) {
          isPlayingRef.current = true;
          setAnimationRun((run) => run + 1);
          return;
        }

        if (!entry.isIntersecting || entry.intersectionRatio < 0.35) {
          isPlayingRef.current = false;
        }
      },
      { threshold: [0, 0.35, 0.65] },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="official-mobile-pain-diagnostics" aria-label={scanLabel}>
      <div className="official-mobile-pain-stage" key={animationRun}>
        <div className="official-mobile-pain-orbit" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="official-mobile-pain-scan">
          <span className="official-mobile-pain-scan-line" />
          <span className="official-mobile-pain-scan-glow" />
        </div>
        <ol className="official-mobile-pain-signals">
          {rows.map(([title, text], index) => {
            const Icon = painIcons[index % painIcons.length];
            const summary = mobilePainSummaries[locale][index] ?? text;
            return (
              <li className={`official-mobile-pain-signal official-mobile-pain-signal-${index + 1}`} key={title}>
                <span className="official-mobile-pain-signal-icon">
                  <Icon size={16} />
                </span>
                <span className="official-mobile-pain-signal-copy">
                  <strong>{title}</strong>
                  <span>{summary}</span>
                </span>
              </li>
            );
          })}
        </ol>
        <div className="official-mobile-pain-summary">
          <Bot size={17} />
          <span>{summaryLabel}</span>
        </div>
      </div>
    </div>
  );
}

function OperatingPreview({ locale }: { locale: OfficialLocale }) {
  const copy = officialCopy[locale];

  return (
    <>
      <div className="official-preview-top">
        <strong>{copy.home.previewTitle}</strong>
      </div>
      <div className="official-automation-demo" aria-label={copy.home.previewTitle}>
        <div className="official-loop">
          {copy.home.previewRows.map(([title, text], index) => {
            const Icon = previewIcons[index % previewIcons.length];
            return (
              <div className={`official-loop-node official-loop-node-${index + 1}`} key={title}>
                <Icon size={16} />
                <div>
                  <strong>{title}</strong>
                  <p>{text}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function CapabilityCardsBand({ locale }: { locale: OfficialLocale }) {
  const cards: CapabilityCard[] =
    locale === "zh-CN"
      ? [
          {
            title: "安全隐私的隔离执行空间",
            tone: "dark",
            signals: [
              { icon: LockKeyhole, label: "独立数据" },
              { icon: EyeOff, label: "跨域不可读" },
              { icon: CheckCircle2, label: "授权边界" },
            ],
          },
          {
            title: "AI全自动化完成所有交易流程",
            tone: "light",
            signals: [
              { icon: Route, label: "寻找客资" },
              { icon: MessageSquareText, label: "探寻需求" },
              { icon: RefreshCw, label: "收款复购" },
            ],
          },
          {
            title: "面向制造商和贸易商的B2B销售",
            tone: "accent",
            signals: [
              { icon: Factory, label: "制造商" },
              { icon: Store, label: "贸易商" },
              { icon: Globe2, label: "跨境多渠道" },
            ],
          },
          {
            title: "一支永不休眠的超级销售团队",
            tone: "light",
            signals: [
              { icon: Clock3, label: "7x24" },
              { icon: Bot, label: "自动跟进" },
              { icon: Brain, label: "经验复用" },
            ],
          },
          {
            title: "AI是系统真正的执行者",
            tone: "dark",
            signals: [
              { icon: Workflow, label: "目标授权" },
              { icon: Bot, label: "AI执行" },
              { icon: CheckCircle2, label: "异常确认" },
            ],
          },
        ]
      : [
          {
            title: "Secure private execution space",
            tone: "dark",
            signals: [
              { icon: LockKeyhole, label: "Isolated data" },
              { icon: EyeOff, label: "Tenant-safe" },
              { icon: CheckCircle2, label: "Permission boundary" },
            ],
          },
          {
            title: "AI automates the full deal flow",
            tone: "light",
            signals: [
              { icon: Route, label: "Prospecting" },
              { icon: MessageSquareText, label: "Demand discovery" },
              { icon: RefreshCw, label: "Payment & reorder" },
            ],
          },
          {
            title: "B2B sales for manufacturers and traders",
            tone: "accent",
            signals: [
              { icon: Factory, label: "Manufacturers" },
              { icon: Store, label: "Traders" },
              { icon: Globe2, label: "Cross-border" },
            ],
          },
          {
            title: "An always-on super sales team",
            tone: "light",
            signals: [
              { icon: Clock3, label: "24/7" },
              { icon: Bot, label: "Auto follow-up" },
              { icon: Brain, label: "Reusable memory" },
            ],
          },
          {
            title: "AI is the system's real executor",
            tone: "dark",
            signals: [
              { icon: Workflow, label: "Goals & approval" },
              { icon: Bot, label: "AI execution" },
              { icon: CheckCircle2, label: "Exception review" },
            ],
          },
        ];

  return (
    <OfficialRevealOnView
      ariaLabel={locale === "zh-CN" ? "Mekyro 能力结构" : "Mekyro capability structure"}
      className="official-capability-band"
    >
      {cards.map(({ signals, title, tone }) => (
        <article className={`official-capability-card official-capability-card-${tone}`} key={title}>
          <div className="official-capability-copy">
            <h2>{title}</h2>
            <div className="official-capability-signals" aria-label={title}>
              {signals.map(({ icon: Icon, label }) => (
                <span className="official-capability-signal" key={label}>
                  <Icon size={17} strokeWidth={1.8} />
                  <b>{label}</b>
                </span>
              ))}
            </div>
          </div>
        </article>
      ))}
    </OfficialRevealOnView>
  );
}

function MobileCapabilityStack({ locale }: { locale: OfficialLocale }) {
  const layers: MobileCapabilityLayer[] =
    locale === "zh-CN"
      ? [
          {
            icon: Factory,
            title: "面向制造商与贸易商",
            summary: "理解B2B和跨境销售链路。",
          },
          {
            icon: Route,
            title: "自动成交",
            summary: "从寻找客资到再次复购，连续推进每一步。",
          },
          {
            icon: Clock3,
            title: "超级团队",
            summary: "7x24 跟进客户，沉淀经验并复用。",
          },
          {
            icon: Bot,
            title: "AI 是系统执行者",
            summary: "人类只处理授权与例外。",
          },
          {
            icon: LockKeyhole,
            title: "安全隔离",
            summary: "销售资产只在自己的工作空间内运行。",
          },
        ]
      : [
          {
            icon: Factory,
            title: "B2B context",
            summary: "Built for manufacturers, traders, and cross-border sales.",
          },
          {
            icon: Route,
            title: "Automated deals",
            summary: "The flow keeps moving from prospecting to reorder.",
          },
          {
            icon: Clock3,
            title: "Always-on team",
            summary: "AI follows up, learns, and reuses experience.",
          },
          {
            icon: Bot,
            title: "AI execution",
            summary: "AI executes while humans approve exceptions.",
          },
          {
            icon: LockKeyhole,
            title: "Private space",
            summary: "Sales assets stay inside each tenant workspace.",
          },
        ];

  return (
    <section
      aria-label={locale === "zh-CN" ? "Mekyro 移动端能力结构" : "Mekyro mobile capability structure"}
      className="official-mobile-capability-stack"
    >
      <div className="official-mobile-capability-head">
        <h2>{locale === "zh-CN" ? "专为 B2B 成交而生的 AI 销售系统" : "An AI sales system built for B2B deals"}</h2>
      </div>

      <div className="official-mobile-capability-system">
        <ol className="official-mobile-capability-layers">
          {layers.map(({ icon: Icon, summary, title }, index) => (
            <li className={`official-mobile-capability-layer${index === 1 ? " is-featured" : ""}`} key={title}>
              <span className="official-mobile-capability-icon">
                <Icon size={18} strokeWidth={1.8} />
              </span>
              <div className="official-mobile-capability-copy">
                <h3>{title}</h3>
                <p>{summary}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function OfficialProcessFlowLines() {
  return (
    <svg aria-hidden="true" className="official-process-flow-lines" viewBox="0 0 1180 300" preserveAspectRatio="none">
      <path d="M-180 168C24 76 226 62 418 142S732 250 1360 64" />
      <path d="M-180 90C92 174 310 220 574 124S912 -20 1360 142" />
      <path d="M-180 234C76 288 336 182 610 208S942 292 1360 174" />
    </svg>
  );
}

function ProcessRail({ rows }: { rows: readonly Row[] }) {
  return (
    <div className="official-process-rail">
      {rows.map(([title, text], index) => {
        const Icon = processIcons[index % processIcons.length];
        return (
          <article className="official-process-card" key={title} tabIndex={0}>
            <div className="official-process-card-inner">
              <div className="official-process-face official-process-face-front">
                <span className="official-process-icon">
                  <Icon size={18} />
                </span>
                <h3>{title}</h3>
              </div>
              <div className="official-process-face official-process-face-back">
                <p>{text}</p>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function MobileProcessFlow({ locale, rows }: { locale: OfficialLocale; rows: readonly Row[] }) {
  return (
    <ol className="official-mobile-process-flow" aria-label={locale === "zh-CN" ? "移动端自动化成交流程" : "Mobile automated deal flow"}>
      {rows.map(([title, text], index) => {
        const Icon = processIcons[index % processIcons.length];
        return (
          <li className="official-mobile-process-step" key={title}>
            <span className="official-mobile-process-icon" aria-hidden="true">
              <Icon size={18} strokeWidth={1.8} />
            </span>
            <div className="official-mobile-process-copy">
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function OfficialHomePage({ locale, viewMode = "auto" }: OfficialHomePageProps) {
  return (
    <div className="official-home-responsive" data-view={viewMode}>
      <div className="official-home-desktop" data-official-variant="desktop">
        <OfficialDesktopHomePage locale={locale} />
      </div>
      <div className="official-home-mobile" data-official-variant="mobile">
        <OfficialMobileHomePage locale={locale} viewMode={viewMode} />
      </div>
    </div>
  );
}

function OfficialDesktopHomePage({ locale }: OfficialPageProps) {
  const copy = officialCopy[locale];
  const splitBy = locale === "en-US" ? "word" : "character";

  return (
    <OfficialShell active="home" locale={locale}>
      <OfficialHero
        title={copy.home.title}
        category={copy.home.subtitle}
        lead={copy.home.lead}
        splitBy={splitBy}
        nav={<OfficialDesktopNav active="home" className="official-hero-nav" locale={locale} />}
        actions={
          <>
            <Link className="official-button official-button-primary" to={withLocale("/contact", locale)}>
              <span>{copy.home.actions.primary}</span>
              <ArrowRight size={15} />
            </Link>
            <a className="official-button official-button-quiet" href="#supplier-showcase">
              <span>{copy.home.actions.secondary}</span>
            </a>
          </>
        }
      />

      <SupplierTwoShowcase locale={locale} />

      <CapabilityCardsBand locale={locale} />

      <section className="official-section official-pain-section">
        <SectionHead
          eyebrow={locale === "zh-CN" ? "运营挑战" : "Operating challenges"}
          title={copy.home.painsTitle}
          lead={copy.home.painsLead}
        />
        <PainBreakdown locale={locale} rows={copy.home.pains} />
      </section>

      <section className="official-section official-process-section">
        <OfficialProcessFlowLines />
        <SectionHead
          eyebrow={locale === "zh-CN" ? "这不是另外一个销售软件" : "This is not another sales app"}
          title={copy.home.processTitle}
          lead={copy.home.processLead}
        />
        <ProcessRail rows={copy.home.processRows} />
      </section>
    </OfficialShell>
  );
}

function OfficialMobileHomePage({ locale, viewMode }: OfficialHomePageProps & { viewMode: OfficialViewportMode }) {
  const copy = officialCopy[locale];

  return (
    <OfficialMobileShell locale={locale} viewMode={viewMode}>
      <OfficialMobileHero locale={locale} viewMode={viewMode} />

      <SupplierTwoShowcase locale={locale} sectionId="mobile-supplier-showcase" />

      <MobileCapabilityStack locale={locale} />

      <section className="official-section official-pain-section">
        <SectionHead
          eyebrow={locale === "zh-CN" ? "运营挑战" : "Operating challenges"}
          title={locale === "zh-CN" ? "传统销售运营\n面临哪些挑战" : copy.home.painsTitle}
          lead={copy.home.painsLead}
        />
        <MobilePainDiagnostics locale={locale} rows={copy.home.pains} />
      </section>

      <section className="official-section official-process-section">
        <OfficialProcessFlowLines />
        <SectionHead
          eyebrow={locale === "zh-CN" ? "这不是另外一个销售软件" : "This is not another sales app"}
          title={copy.home.processTitle}
          lead={copy.home.processLead}
        />
        <MobileProcessFlow locale={locale} rows={copy.home.processRows} />
      </section>
    </OfficialMobileShell>
  );
}

export function OfficialAboutPage({ locale }: OfficialPageProps) {
  const copy = officialCopy[locale];
  const about = copy.about;
  const [whySection, workSection, teamSection, boundarySection] = about.sections;
  const firstFeatureRows = about.modelRows.slice(0, 2);
  const secondFeatureRows: readonly Row[] = [
    about.principles[0],
    about.principles[2],
  ];
  const thirdFeatureRows: readonly Row[] = [about.principles[1], about.principles[3]];
  const fourthFeatureRows: readonly Row[] = about.rows.slice(1, 3);
  const stackCards: readonly AboutStackCardData[] = [
    {
      paragraphs: whySection.paragraphs,
      rows: firstFeatureRows,
      title: whySection.title,
    },
    {
      paragraphs: workSection.paragraphs,
      rows: secondFeatureRows,
      title: workSection.title,
    },
    {
      paragraphs: boundarySection.paragraphs,
      rows: thirdFeatureRows,
      title: boundarySection.title,
    },
    {
      paragraphs: teamSection.paragraphs,
      rows: fourthFeatureRows,
      title: teamSection.title,
    },
  ];

  return (
    <OfficialShell active="about" locale={locale}>
      <section className="official-about-studio-page">
        <section className="official-about-studio-hero">
          <h1>{about.title}</h1>
          <p>{about.lead}</p>
          <div className="official-about-studio-actions">
            <Button className="official-about-cta-primary" nativeButton={false} render={<Link to={withLocale("/contact", locale)} />}>
              <span>{copy.common.primaryCta}</span>
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button variant="outline" className="official-about-cta-secondary" nativeButton={false} render={<Link to={withLocale("/pricing", locale)} />}>
              <span>{copy.nav.pricing}</span>
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </section>

        <section className="official-about-stack" aria-label={locale === "zh-CN" ? "Mekyro 关于我们叙事" : "Mekyro about narrative"}>
          {stackCards.map((card) => (
            <article className="official-about-stack-card" key={card.title}>
              <OfficialNoise patternAlpha={46} patternRefreshInterval={5} patternSize={132} />
              <div className="official-about-stack-heading">
                <h2>{card.title}</h2>
              </div>
              <div className="official-about-stack-copy">
                <div className="official-about-stack-body">
                  {card.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
                <ul className="official-about-stack-points">
                  {card.rows.map(([title, text]) => (
                    <li key={title}>
                      <CheckCircle2 size={17} />
                      <span>
                        <strong>{title}</strong>
                        <span>{text}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </section>
      </section>
    </OfficialShell>
  );
}

export function OfficialAboutContactPage({ locale }: OfficialPageProps) {
  const copy = officialCopy[locale];
  const contact = copy.aboutContact;

  return (
    <OfficialShell active="aboutContact" locale={locale}>
      <section className="official-about-contact-page" aria-labelledby="official-about-contact-title">
        <div className="official-about-contact-title">
          <h1 id="official-about-contact-title">{contact.title}</h1>
          <span aria-hidden="true" />
        </div>

        <div className="official-about-contact-layout">
          <div className="official-about-contact-visual" aria-label={contact.imageAlt}>
            <OfficialNoise patternAlpha={34} patternRefreshInterval={5} patternSize={180} />
            <img
              alt=""
              src="https://mekyro.oss-cn-hongkong.aliyuncs.com/mekyro/mekyro-contact-communication.png"
            />
          </div>

          <div className="official-about-contact-copy">
            <h2>{contact.heading}</h2>
            <p>{contact.lead}</p>

            <div className="official-about-contact-cards">
              {contact.cards.map(([title, lineOne, lineTwo], index) => {
                const Icon = aboutContactIcons[index] ?? MessageSquareText;

                return (
                  <article className="official-about-contact-card" key={title}>
                    <span className="official-about-contact-card-icon" aria-hidden="true">
                      <Icon size={19} strokeWidth={1.8} />
                    </span>
                    <div>
                      <h3>{title}</h3>
                      <p>{lineOne}</p>
                      <p>{lineTwo}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </OfficialShell>
  );
}

export function OfficialFaqPage({ locale }: OfficialPageProps) {
  const copy = officialCopy[locale];
  const cooperationRows = [...copy.pricing.qaRows, ...copy.contact.qaRows] as readonly Row[];
  const isChinese = locale === "zh-CN";
  const groups = [
    {
      description: isChinese ? "托管范围、销售团队协作与 AI 授权边界。" : "Managed scope, sales team collaboration, and AI approval boundaries.",
      icon: Factory,
      id: "supplier",
      rows: copy.home.qaRows,
      title: copy.faq.supplierTitle,
    },
    {
      description: isChinese ? "买家询价、登录方式和安全交易上下文。" : "Buyer inquiry, sign-in expectations, and secure deal context.",
      icon: Store,
      id: "buyer",
      rows: copy.security.buyerRows,
      title: copy.faq.buyerTitle,
    },
    {
      description: isChinese ? "年费、启动配置和合作前确认。" : "Annual pricing, setup scope, and pre-cooperation confirmation.",
      icon: LockKeyhole,
      id: "cooperation",
      rows: cooperationRows,
      title: copy.faq.cooperationTitle,
    },
  ] as const;
  const [activeGroupId, setActiveGroupId] = useState<(typeof groups)[number]["id"]>("supplier");
  const activeGroup = groups.find(group => group.id === activeGroupId) ?? groups[0];
  const [openQuestion, setOpenQuestion] = useState(activeGroup.rows[0]?.[0] ?? "");

  const handleGroupChange = (group: (typeof groups)[number]) => {
    setActiveGroupId(group.id);
    setOpenQuestion(group.rows[0]?.[0] ?? "");
  };
  const labels = isChinese
    ? {
        eyebrow: "FAQ",
        helpCta: "申请托管",
        helpText: "欢迎您直接联系我们，我们将尽快回复您",
        helpTitle: "没有找到答案？",
        lead: "关于 Mekyro 托管服务、供应商后台、买家询价和费用边界的关键问题。",
        pricing: "查看服务费用",
        selectorTitle: "你在确认哪类问题？",
      }
    : {
        eyebrow: "FAQ",
        helpCta: "Apply for managed service",
        helpText: "Send us your sales flow and we will confirm whether it fits a managed Mekyro setup.",
        helpTitle: "Still unsure?",
        lead: "Key questions about Mekyro managed service, supplier workspace, buyer inquiry, and pricing boundaries.",
        pricing: "View pricing",
        selectorTitle: "What are you checking?",
      };

  return (
    <OfficialShell active="faq" locale={locale}>
      <section className="official-faq-page">
        <div className="official-faq-layout">
          <aside className="official-faq-aside" aria-label={labels.helpTitle}>
            <div className="official-faq-intro">
              <h1>{copy.faq.title}</h1>
            </div>
            <div className="official-faq-help">
              <h2>{labels.helpTitle}</h2>
              <p>{labels.helpText}</p>
              <div className="official-faq-help-actions">
                <Link className="official-button official-button-primary" to={withLocale("/contact", locale)}>
                  <span>{labels.helpCta}</span>
                  <ArrowRight size={15} />
                </Link>
                <Link className="official-button official-button-quiet" to={withLocale("/pricing", locale)}>
                  <span>{labels.pricing}</span>
                </Link>
              </div>
            </div>
          </aside>

          <div className="official-faq-panel" role="tabpanel">
            <div className="official-faq-tabs" role="tablist" aria-label={copy.faq.title}>
              {groups.map(group => {
                const Icon = group.icon;
                const isActive = group.id === activeGroup.id;

                return (
                  <button
                    aria-selected={isActive}
                    className={`official-faq-tab${isActive ? " is-active" : ""}`}
                    key={group.id}
                    onClick={() => handleGroupChange(group)}
                    role="tab"
                    type="button"
                  >
                    <Icon size={15} strokeWidth={1.8} />
                    <span>{group.title}</span>
                  </button>
                );
              })}
            </div>
            <FaqAccordion openQuestion={openQuestion} rows={activeGroup.rows} setOpenQuestion={setOpenQuestion} />
          </div>
        </div>
      </section>
    </OfficialShell>
  );
}

function FaqAccordion({
  openQuestion,
  rows,
  setOpenQuestion,
}: {
  openQuestion: string;
  rows: readonly Row[];
  setOpenQuestion: (question: string) => void;
}) {
  return (
    <div className="official-faq-accordion">
      {rows.map(([question, answer]) => {
        const isOpen = openQuestion === question;

        return (
          <article className={`official-faq-item${isOpen ? " is-open" : ""}`} key={question}>
            <button
              aria-expanded={isOpen}
              className="official-faq-trigger"
              onClick={() => setOpenQuestion(isOpen ? "" : question)}
              type="button"
            >
              <span>{question}</span>
              <span className="official-faq-trigger-icon" aria-hidden="true">
                <ChevronDown size={17} strokeWidth={1.9} />
              </span>
            </button>
            <div className="official-faq-answer-shell" aria-hidden={!isOpen}>
              <div className="official-faq-answer">
                <p>{answer}</p>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function OfficialLoginPage({ locale }: OfficialPageProps) {
  const copy = officialCopy[locale];
  const [loginMode, setLoginMode] = useState<"password" | "sms" | "email">("sms");
  const isZh = locale === "zh-CN";
  const welcomeTitle = isZh ? "欢迎回来" : "Welcome back";
  const welcomeLead = isZh
    ? "让 AI 把重复沟通、线索推进和交易记忆沉淀成团队可以持续复用的增长资产。"
    : "Let AI turn repeated conversations, lead progress, and deal memory into reusable growth assets for your team.";
  const welcomeNote = isZh
    ? "把琐碎交给系统，把关键判断留给团队。"
    : "Let the system handle repetition while your team keeps the judgment.";

  const tabBar = (
    <div className="official-login-tabs">
      <button
        className={`official-login-tab${loginMode === "sms" ? " is-active" : ""}`}
        onClick={() => setLoginMode("sms")}
        type="button"
      >
        {copy.login.tabSms}
      </button>
      <button
        className={`official-login-tab${loginMode === "password" ? " is-active" : ""}`}
        onClick={() => setLoginMode("password")}
        type="button"
      >
        {copy.login.tabPassword}
      </button>
      <button
        className={`official-login-tab${loginMode === "email" ? " is-active" : ""}`}
        onClick={() => setLoginMode("email")}
        type="button"
      >
        {copy.login.tabEmail}
      </button>
    </div>
  );
  const loginForm =
    loginMode === "password" ? (
      <LoginForm
        accountLabel={copy.login.supplier.accountLabel}
        accountPlaceholder={copy.login.supplier.accountPlaceholder}
        audience="supplier"
        cta={copy.login.supplier.cta}
        nextPath="/supplier"
        passwordLabel={copy.login.supplier.passwordLabel}
        passwordPlaceholder={copy.login.supplier.passwordPlaceholder}
        tabBar={tabBar}
      />
    ) : loginMode === "email" ? (
      <EmailLoginForm
        apiPath="/api/user/email/vendor-login/"
        audience="supplier"
        cta={copy.login.supplier.emailCta}
        key={`supplier-email-${locale}`}
        locale={locale}
        nextPath="/supplier"
        emailLabel={copy.login.supplier.emailLabel}
        emailPlaceholder={copy.login.supplier.emailPlaceholder}
        tabBar={tabBar}
      />
    ) : (
      <SmsLoginForm
        apiPath="/api/user/sms/vendor-login/"
        audience="supplier"
        cta={copy.login.supplier.smsCta}
        key={`supplier-sms-${locale}`}
        locale={locale}
        nextPath="/supplier"
        phoneLabel={copy.login.supplier.smsPhoneLabel}
        phonePlaceholder={copy.login.supplier.smsPhonePlaceholder}
        tabBar={tabBar}
      />
    );

  return (
    <OfficialShell active="login" locale={locale}>
      <section className="official-login-layout" aria-labelledby="official-login-title">
        <OfficialBorderGlow
          animated
          backgroundColor="#151617"
          borderRadius={8}
          className="official-login-shell-panel"
          colors={["#c5e803", "#f6ffe9", "#73805b"]}
          coneSpread={20}
          edgeSensitivity={22}
          fillOpacity={0.2}
          glowColor="75 96 58"
          glowIntensity={0.64}
          glowRadius={26}
        >
          <OfficialNoise patternAlpha={24} patternRefreshInterval={3} patternSize={150} />
          <div className="official-login-hero-panel">
            <div className="official-login-copy">
              <h1 id="official-login-title">{welcomeTitle}</h1>
            </div>

            <div className="official-login-welcome-note">
              <span>{welcomeLead}</span>
              <span>{welcomeNote}</span>
            </div>
          </div>

          <article className="official-login-form-panel" aria-label={copy.login.supplier.title}>
            {loginForm}
          </article>
        </OfficialBorderGlow>
      </section>
    </OfficialShell>
  );
}

export function OfficialOpsEntryPage({ locale }: OfficialPageProps) {
  const copy = officialCopy[locale];

  return (
    <OfficialShell active="opsEntry" locale={locale}>
      <PageHead title={copy.opsEntry.title} lead={copy.opsEntry.lead} />

      <section className="official-entry-layout">
        <article className="official-entry official-entry-highlight official-login-card">
          <div>
            <h2>{copy.opsEntry.ops.title}</h2>
            <p>{copy.opsEntry.ops.text}</p>
          </div>
          <LoginForm
            accountLabel={copy.opsEntry.ops.accountLabel}
            accountPlaceholder={copy.opsEntry.ops.accountPlaceholder}
            audience="ops"
            cta={copy.opsEntry.ops.cta}
            hint={copy.opsEntry.ops.hint}
            nextPath="/ops"
            passwordLabel={copy.opsEntry.ops.passwordLabel}
            passwordPlaceholder={copy.opsEntry.ops.passwordPlaceholder}
          />
        </article>
      </section>

      <section className="official-section official-section-tight">
        <DenseRows rows={copy.opsEntry.proofRows} />
      </section>
    </OfficialShell>
  );
}

export function OfficialContactPage({ locale }: OfficialPageProps) {
  const copy = officialCopy[locale];

  return (
    <OfficialShell active="contact" locale={locale}>
      <PageHead title={copy.contact.title} lead={copy.contact.lead} accentTitle />

      <section className="official-contact-layout official-contact-layout-single">
        <article className="official-form-panel official-contact-card" id="supplier-intake" role="form" aria-label={copy.contact.supplierTitle}>
          <div className="official-form-panel-head">
            <h2>{copy.contact.supplierSubtitle}</h2>
          </div>
          <InquiryForm
            type="supplier"
            fields={copy.contact.fields}
            ctaLabel={copy.contact.cta}
            locale={locale}
          />
        </article>
      </section>
    </OfficialShell>
  );
}

export function OfficialBuyerContactPage({ locale }: OfficialPageProps) {
  const copy = officialCopy[locale];

  return (
    <OfficialShell active="contactBuyer" locale={locale}>
      <PageHead title={copy.contact.buyerPageTitle} lead={copy.contact.buyerPageLead} accentTitle />

      <section className="official-contact-layout official-contact-layout-single">
        <article className="official-form-panel official-contact-card official-contact-card-buyer" id="buyer-request" role="form" aria-label={copy.contact.buyerTitle}>
          <div className="official-form-panel-head">
            <h2>{copy.contact.buyerSubtitle}</h2>
          </div>
          <InquiryForm
            type="buyer"
            fields={copy.contact.buyerFields}
            ctaLabel={copy.contact.buyerCta}
            locale={locale}
          />
        </article>
      </section>
    </OfficialShell>
  );
}

export function OfficialSecurityPage({ locale }: OfficialPageProps) {
  const copy = officialCopy[locale];

  return (
    <OfficialShell active="security" locale={locale}>
      <PageHead title={copy.security.title} lead={copy.security.lead} accentTitle />
      <section className="official-section">
        <RowList rows={copy.security.rows} className="official-security-row-list" />
      </section>
      <section className="official-section official-section-lined official-card-row-section official-security-automation-section">
        <SectionHead title={copy.security.automationTitle} />
        <DenseRows rows={copy.security.automationRows} className="official-card-row-grid official-security-automation-grid" />
      </section>
    </OfficialShell>
  );
}

export function OfficialPricingPage({ locale }: OfficialPageProps) {
  const copy = officialCopy[locale];

  return (
    <OfficialShell active="pricing" locale={locale}>
      <PricingDetailPanel locale={locale} rows={copy.pricing.rows} />
    </OfficialShell>
  );
}
