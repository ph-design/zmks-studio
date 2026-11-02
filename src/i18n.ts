import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enTranslations from "./locales/en.json";
import zhTranslations from "./locales/zh.json";
import jaTranslations from "./locales/ja.json";
import frTranslations from "./locales/fr.json";
import esTranslations from "./locales/es.json";

export const SUPPORTED_LANGUAGES = [
  { id: "en", label: "English" },
  { id: "zh", label: "中文" },
  { id: "ja", label: "日本語" },
  { id: "fr", label: "Français" },
  { id: "es", label: "Español" },
];

export const normalizeLang = (lang: string): string => {
  if (lang.startsWith("zh")) return "zh";
  if (lang.startsWith("ja")) return "ja";
  if (lang.startsWith("fr")) return "fr";
  if (lang.startsWith("es")) return "es";
  return "en";
};

// 获取浏览器语言或从 localStorage 中读取用户选择的语言
const getInitialLanguage = () => {
  const saved = localStorage.getItem("language");
  if (saved) {
    return normalizeLang(saved);
  }

  return normalizeLang(navigator.language.toLowerCase());
};

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: enTranslations },
    zh: { translation: zhTranslations },
    ja: { translation: jaTranslations },
    fr: { translation: frTranslations },
    es: { translation: esTranslations },
  },
  lng: getInitialLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

// 监听语言变化，保存到 localStorage
i18n.on("languageChanged", (lng) => {
  localStorage.setItem("language", lng);
});

export default i18n;
