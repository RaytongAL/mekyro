import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zhCN from "./zh-CN.json";
import enUS from "./en-US.json";

const STORAGE_KEY = "mekyro_locale";

export type Locale = "zh-CN" | "en-US";

export function detectBrowserLocale(): Locale {
  const lang = navigator.language;
  if (lang.startsWith("zh")) return "zh-CN";
  return "en-US";
}

const savedLocale = (localStorage.getItem(STORAGE_KEY) as Locale) || detectBrowserLocale();
localStorage.setItem(STORAGE_KEY, savedLocale);

i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": { translation: zhCN },
    "en-US": { translation: enUS },
  },
  lng: savedLocale,
  fallbackLng: "zh-CN",
  interpolation: { escapeValue: false },
});

export default i18n;
