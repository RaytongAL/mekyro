import { Monitor, Smartphone } from "lucide-react";
import { useSiteViewMode } from "@/hooks/use-site-view-mode";
import type { OfficialLocale } from "@/lib/official-site/content";

type SiteViewModeToggleProps = {
  className?: string;
  locale: OfficialLocale;
};

export function SiteViewModeToggle({ className, locale }: SiteViewModeToggleProps) {
  const { setViewMode, targetViewMode } = useSiteViewMode();
  const isSwitchingToDesktop = targetViewMode === "desktop";
  const Icon = isSwitchingToDesktop ? Monitor : Smartphone;
  const label =
    locale === "zh-CN"
      ? isSwitchingToDesktop
        ? "切换到电脑版"
        : "切换到手机版"
      : isSwitchingToDesktop
        ? "Switch to desktop"
        : "Switch to mobile";

  return (
    <button
      type="button"
      className={`site-view-toggle${className ? ` ${className}` : ""}`}
      onClick={() => setViewMode(targetViewMode)}
    >
      <Icon data-icon="inline-start" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
