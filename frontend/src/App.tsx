import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { OfficialHomePage, OfficialLoginPage, OfficialContactPage, OfficialBuyerContactPage, OfficialFaqPage, OfficialPricingPage, OfficialAboutPage, OfficialAboutContactPage, OfficialOpsEntryPage, OfficialSecurityPage } from "@/components/official-site";
import { isOfficialLocale } from "@/lib/official-site/content";
import { useLocale } from "@/hooks/use-locale";
import { useSiteViewMode } from "@/hooks/use-site-view-mode";
import { SupplierShell } from "@/components/supplier-shell/supplier-shell";
import { OpsShell } from "@/components/ops-shell/ops-shell";
import { QuotePage } from "@/pages/quote";
import { SiteDeviceFrame } from "@/components/site-device-frame";

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

function AppRoutes() {
  const { viewMode } = useSiteViewMode();

  return (
    <div className="site-view-mode-root" data-view-mode={viewMode}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LocalePage Component={OfficialLoginPage} title="登录 - Mekyro" />} />
        <Route path="/contact" element={<LocalePage Component={OfficialContactPage} />} />
        <Route path="/contact/buyer" element={<LocalePage Component={OfficialBuyerContactPage} />} />
        <Route path="/about" element={<LocalePage Component={OfficialAboutPage} />} />
        <Route path="/about/contact" element={<LocalePage Component={OfficialAboutContactPage} />} />
        <Route path="/faq" element={<LocalePage Component={OfficialFaqPage} />} />
        <Route path="/pricing" element={<LocalePage Component={OfficialPricingPage} />} />
        <Route path="/security" element={<LocalePage Component={OfficialSecurityPage} />} />
        <Route path="/ops-entry" element={<LocalePage Component={OfficialOpsEntryPage} />} />
        <Route path="/buyer/request" element={<BuyerRequestRedirect />} />
        <Route path="/quote/:quoteToken" element={<QuotePage />} />
        <Route path="/supplier" element={<AuthGuard role="supplier"><SupplierPage /></AuthGuard>} />
        <Route path="/ops" element={<AuthGuard role="ops"><OpsPage /></AuthGuard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function BuyerRequestRedirect() {
  const [searchParams] = useSearchParams();
  const search = searchParams.toString();
  return <Navigate to={`/contact/buyer${search ? `?${search}` : ""}`} replace />;
}

function LocalePage({ Component, title }: { Component: React.ComponentType<{ locale: "zh-CN" | "en-US" }>; title?: string }) {
  const [searchParams] = useSearchParams();
  const { locale: storedLocale } = useLocale();
  const urlLocale = searchParams.get("locale");
  const locale = isOfficialLocale(urlLocale) ? urlLocale : storedLocale;
  useEffect(() => {
    if (title) {
      document.title = title;
      // 组件卸载时恢复默认标题
      return () => {
        document.title = "Mekyro";
      };
    }
  }, [title]);
  return <Component locale={locale} />;
}

function HomePage() {
  const [searchParams] = useSearchParams();
  const { locale: storedLocale } = useLocale();
  const { effectiveViewMode } = useSiteViewMode();
  const urlLocale = searchParams.get("locale");
  const locale = isOfficialLocale(urlLocale) ? urlLocale : storedLocale;
  return <OfficialHomePage locale={locale} viewMode={effectiveViewMode} />;
}

function SupplierPage() {
  const [searchParams] = useSearchParams();
  const { isNarrowViewport, viewMode } = useSiteViewMode();
  useEffect(() => {
    document.title = "Mekyro";
  }, []);
  if (viewMode === "mobile" && !isNarrowViewport) {
    return <SiteDeviceFrame title="Mekyro supplier mobile view" />;
  }

  return (
    <SupplierShell
      initialScreen={searchParams.get("screen")}
      initialTodoId={searchParams.get("todo")}
      viewMode={viewMode}
    />
  );
}

function OpsPage() {
  const [searchParams] = useSearchParams();
  const { isNarrowViewport, viewMode } = useSiteViewMode();
  useEffect(() => {
    document.title = "Mekyro";
  }, []);
  if (viewMode === "mobile" && !isNarrowViewport) {
    return <SiteDeviceFrame title="Mekyro operations mobile view" />;
  }

  return <OpsShell initialScreen={searchParams.get("screen")} viewMode={viewMode} />;
}
