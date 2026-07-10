import { I18n, type TranslateOptions } from 'i18n-js';
import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import fr from '@/locales/fr.json';
import en from '@/locales/en.json';

export type Locale = 'fr' | 'en';
/** null = automatique (langue de l'appareil) */
export type LocaleOverride = Locale | null;

const LOCALE_KEY = 'watchy_locale';

const i18n = new I18n({ fr, en });
i18n.defaultLocale = 'fr';
i18n.enableFallback = true;

function deviceLocale(): Locale {
  return getLocales()[0]?.languageCode === 'fr' ? 'fr' : 'en';
}

type LocaleState = {
  locale: Locale;
  override: LocaleOverride;
  setOverride: (override: LocaleOverride) => Promise<void>;
};

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: deviceLocale(),
  override: null,
  setOverride: async (override) => {
    const locale = override ?? deviceLocale();
    i18n.locale = locale;
    set({ locale, override });
    if (override) await SecureStore.setItemAsync(LOCALE_KEY, override);
    else await SecureStore.deleteItemAsync(LOCALE_KEY);
  },
}));

i18n.locale = useLocaleStore.getState().locale;

/** À appeler au démarrage (avant de cacher le splash) pour éviter un flash de langue. */
export async function loadLocaleOverride(): Promise<void> {
  const stored = await SecureStore.getItemAsync(LOCALE_KEY);
  const override: LocaleOverride = stored === 'fr' || stored === 'en' ? stored : null;
  const locale = override ?? deviceLocale();
  i18n.locale = locale;
  useLocaleStore.setState({ locale, override });
}

export function getActiveLocale(): Locale {
  return useLocaleStore.getState().locale;
}

/** Traduction hors composants (gates, purchases, callbacks…). */
export function t(key: string, options?: TranslateOptions): string {
  return i18n.t(key, options);
}

/** Traduction dans les composants : s'abonne à la locale pour re-rendre au changement. */
export function useT(): typeof t {
  useLocaleStore((s) => s.locale);
  return t;
}
