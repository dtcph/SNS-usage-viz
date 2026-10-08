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
  // Korean counts in myriads: 1,231,000 -> "123만 1천" (major unit plus the next unit's digit), not "123.1만".
  const KO_UNITS = [[1e12, '조', 1e11, '천억'], [1e8, '억', 1e7, '천만'], [1e4, '만', 1e3, '천']];
  const compact = lang === 'ko'
    ? { format(n) {
      for (const [big, name, small, smallName] of KO_UNITS) {
        if (n < big) continue;
        const rest = Math.floor((n % big) / small);
        return `${nf.format(Math.floor(n / big))}${name}${rest ? ` ${rest}${smallName}` : ''}`;
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
    /** 125 -> "2 h 5 min" / "2시간 5분" */
    hoursMinutes(min) {
      const h = Math.floor(Math.round(min) / 60), m = Math.round(min) % 60;
      return h && m ? t('time.hm', { h, m }) : h ? t('time.h', { h }) : t('time.m', { m });
    },
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
