import { getActiveLocale } from './i18n';

/** La cote et les prix restent en euros ; seul le format d'affichage suit la langue. */
function localeTag(): string {
  return getActiveLocale() === 'fr' ? 'fr-FR' : 'en-US';
}

export function formatCurrency(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(localeTag(), {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
    ...options,
  }).format(value);
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(localeTag(), options).format(value);
}

export function formatDate(iso: string | Date, options?: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleDateString(localeTag(), options);
}
