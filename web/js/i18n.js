import "./messages.js";
import { onlineMessages } from "./online-messages.js";

export const languages = {
  ja: "日本語", en: "English", es: "Español", "pt-BR": "Português (Brasil)",
  "zh-Hans": "简体中文", fr: "Français", de: "Deutsch", ko: "한국어",
  ru: "Русский", it: "Italiano", "zh-Hant": "繁體中文", id: "Bahasa Indonesia",
  tr: "Türkçe", vi: "Tiếng Việt", th: "ไทย"
};

function resolve(value) {
  if (typeof value !== "string") return null;
  const [base, ...subtags] = value.trim().toLowerCase().replaceAll("_", "-").split("-");
  if (base === "zh") {
    const extension = subtags.findIndex(tag => tag.length === 1);
    const tags = extension < 0 ? subtags : subtags.slice(0, extension);
    const script = tags.find(tag => tag === "hans" || tag === "hant");
    if (script) return script === "hant" ? "zh-Hant" : "zh-Hans";
    return tags.some(tag => ["tw", "hk", "mo"].includes(tag)) ? "zh-Hant" : "zh-Hans";
  }
  if (base === "pt") return "pt-BR";
  return Object.hasOwn(languages, base) ? base : null;
}

function savedLanguage() {
  try { return localStorage.getItem("songen_language"); } catch { return null; }
}

export let language = resolve(savedLanguage()) ||
  [...navigator.languages, navigator.language].map(resolve).find(Boolean) || "ja";

export function setLanguage(value) {
  if (!Object.hasOwn(languages, value)) return;
  language = value;
  try { localStorage.setItem("songen_language", value); } catch { /* Session still uses the selection. */ }
  applyLanguage();
}

export function t(key, values = {}) {
  const original = globalThis.SongenMessages[language];
  const title = `${original.m001}3`;
  const share = language === "ja" ? "Xにシェア" : original.m008;
  const text = key === "title" ? title : key === "share" ? share : onlineMessages[language][key] ?? original[key] ?? key;
  return text.replace(/\{(p\d+)\}/g, (_, name) => String(values[name] ?? ""));
}

export function applyLanguage() {
  document.documentElement.lang = language;
  const title = t("title");
  document.title = title;
  const heading = document.querySelector("#home-title");
  if (language === "ja") {
    const firstLine = "尊厳を";
    heading.replaceChildren(firstLine, document.createElement("br"), title.slice(firstLine.length));
  } else {
    heading.textContent = title;
  }
  for (const element of document.querySelectorAll("[data-i18n]")) element.textContent = t(element.dataset.i18n);
  for (const attribute of ["aria-label", "placeholder"]) {
    for (const element of document.querySelectorAll(`[data-i18n-${attribute}]`)) {
      element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`)));
    }
  }
}
