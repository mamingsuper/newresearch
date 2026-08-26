import { en, type I18nKey } from "./en";
import { zh } from "./zh";

export type Lang = "en" | "zh";

const dictionaries = { en, zh } as Record<Lang, Record<string, string>>;

export function t(key: I18nKey, lang: Lang): string {
  return dictionaries[lang]?.[key] ?? dictionaries.en[key] ?? key;
}

export { en };
export type { I18nKey };
