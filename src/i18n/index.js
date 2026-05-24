import zh from "./zh";
import en from "./en";
import ko from "./ko";

const translations = { zh, en, ko };

export function getTranslations(lang = "zh") {
  return translations[lang] || translations.zh;
}

export function useTranslation(language) {
  const t = translations[language] || translations.zh;
  const interpolate = (str, vars = {}) => {
    if (typeof str === "function") return str(vars);
    if (typeof str !== "string") return str;
    return str.replace(/\$\{(\w+)\}/g, (_, key) => vars[key] ?? "");
  };
  return { t, interpolate, language };
}