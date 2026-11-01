import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import sv from "./locales/sv.json";
import de from "./locales/de.json";

const STORAGE_KEY = "avencrestcorp.lang";

function getStoredLang(): string {
  if (typeof window === "undefined") return "en";
  try {
    return window.localStorage.getItem(STORAGE_KEY) || "en";
  } catch {
    return "en";
  }
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    sv: { translation: sv },
    de: { translation: de },
  },
  lng: getStoredLang(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export function setLanguage(lang: string): void {
  i18n.changeLanguage(lang);
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore
  }
}

export function getCurrentLanguage(): string {
  return i18n.language || "en";
}

export default i18n;