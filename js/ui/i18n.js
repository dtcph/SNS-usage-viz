// Translations (/i18n/<lang>.json), number formats and country names. No strings live in the code.
import { LOCALES } from '../config.js';

const cache = new Map();

export async function loadLang(lang) {
  if (!cache.has(lang)) {
    const res = await fetch(`i18n/${lang}.json`);
    if (!res.ok) throw new Error(`i18n/${lang}.json: HTTP ${res.status}`);
    cache.set(lang, await res.json());
  }
  return cache.get(lang);
}

const lookup = (dict, key) => key.split('.').reduce((o, k) => (o == null ? o : o[k]), dict);

/** Builds a formatter set for one language. */
export function createI18n(lang, dict) {
  const locale = LOCALES[lang] ?? lang;
  const nf = new Intl.NumberFormat(locale);
  const compactIntl = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
  // Big counts are estimates, so they stay short. English: "17.9M". Korean counts in myriads and keeps only the major unit:
  // 17,906,000 -> "1,791만", 211,800,000 -> "2.1억" (not "1,790만 6천").
  const nf1 = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const compact = lang === 'ko'
    ? { format(n) {
      for (const [big, name] of [[1e12, '조'], [1e8, '억'], [1e4, '만']]) {
        if (n < big) continue;
        const v = n / big;
        return `${v < 10 ? nf1.format(v) : nf.format(Math.round(v))}${name}`;
      }
      return nf.format(Math.round(n));
    } }
    : compactIntl;
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
  let regionNames = null;
  try { regionNames = new Intl.DisplayNames([locale], { type: 'region' }); } catch { /* falls back to topology names */ }

  const t = (key, params = {}) => {
    const s = lookup(dict, key);
    if (typeof s !== 'string') return key; // visible, but never throws
    return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? `{${k}}`));
  };

  return {
    lang, locale, t,
    list: (key) => lookup(dict, key) ?? [],
    number: (n) => nf.format(Math.round(n)),
    compact: (n) => compact.format(n),
    percent: (x) => percent.format(x),
    date: (iso) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso)),
    /** Localised country name from the ISO alpha-2 code; falls back to the given English name. */
    countryName(a2, fallback) {
      try {
        const n = a2 && regionNames?.of(a2);
        return n && n !== a2 ? n : fallback ?? '';
      } catch { return fallback ?? ''; }
    },
    /** 125 -> "125 min" / "125분" (all durations are shown in minutes) */
    minutes: (min) => t('time.m', { m: nf.format(Math.round(min)) }),
    /** Applies data-i18n="key" (text) and data-i18n-attr="attr:key;attr2:key2" to the document. */
    apply(root = document) {
      document.documentElement.lang = lang;
      root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
      root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
        for (const pair of el.dataset.i18nAttr.split(';')) {
          const [attr, key] = pair.split(':');
          el.setAttribute(attr.trim(), t(key.trim()));
        }
      });
    },
  };
}
