// Textes légaux par locale. La version française est la version canonique
// (droit français) ; l'anglaise est une traduction de courtoisie (en.ts).
import * as fr from './fr';
import * as en from './en';

export type LegalLocale = 'fr' | 'en';

export interface LegalDocs {
  updated: string;
  notice: string;
  terms: string;
  privacy: string;
  aiNotice: string;
  paywall: string;
}

export const LEGAL: Record<LegalLocale, LegalDocs> = {
  fr: {
    updated: fr.LEGAL_UPDATED,
    notice: fr.LEGAL_NOTICE_TEXT,
    terms: fr.TERMS_TEXT,
    privacy: fr.PRIVACY_TEXT,
    aiNotice: fr.AI_ANALYSIS_NOTICE_TEXT,
    paywall: fr.PAYWALL_LEGAL_TEXT,
  },
  en: {
    updated: en.LEGAL_UPDATED,
    notice: en.LEGAL_NOTICE_TEXT,
    terms: en.TERMS_TEXT,
    privacy: en.PRIVACY_TEXT,
    aiNotice: en.AI_ANALYSIS_NOTICE_TEXT,
    paywall: en.PAYWALL_LEGAL_TEXT,
  },
};

// Exports historiques : la version française reste la source par défaut
export {
  LEGAL_UPDATED,
  LEGAL_NOTICE_TEXT,
  TERMS_TEXT,
  PRIVACY_TEXT,
  AI_ANALYSIS_NOTICE_TEXT,
  PAYWALL_LEGAL_TEXT,
} from './fr';
