import { useCallback, useSyncExternalStore } from "react";
import i18n, { type Locale } from "@/i18n";
import { api } from "@/lib/api";

const STORAGE_KEY = "mekyro_locale";

function getSnapshot(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "zh-CN" || stored === "en-US") return stored;
  return "zh-CN";
}

function getServerSnapshot(): Locale {
  return "zh-CN";
}

function subscribe(callback: () => void) {
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

function syncToBackend(locale: Locale) {
  api("/api/user/language/", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language: locale }),
  }).catch(() => {});
}

export function useLocale() {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setLocale = useCallback((next: Locale) => {
    localStorage.setItem(STORAGE_KEY, next);
    i18n.changeLanguage(next);
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    syncToBackend(next);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === "zh-CN" ? "en-US" : "zh-CN");
  }, [locale, setLocale]);

  return { locale, setLocale, toggleLocale };
}
