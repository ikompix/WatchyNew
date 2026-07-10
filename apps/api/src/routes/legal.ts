import { Hono } from 'hono';
import { LEGAL, type LegalLocale } from '@watchy/types';

// Pages légales publiques (SANS auth) — App Store Connect exige une URL
// publique de politique de confidentialité ; le paywall pointe aussi ici.
//   /legal/terms · /legal/privacy · /legal/mentions (+ ?lang=en)
// Les URL FR restent canoniques ; la version anglaise est une traduction de
// courtoisie (le FR fait foi).
const router = new Hono();

const TITLES: Record<LegalLocale, Record<string, string>> = {
  fr: {
    terms: "Conditions Générales d'Utilisation et de Vente",
    privacy: 'Politique de confidentialité',
    mentions: 'Mentions légales',
  },
  en: {
    terms: 'Terms of Use and Sale',
    privacy: 'Privacy Policy',
    mentions: 'Legal Notice',
  },
};

const NAV_LABELS: Record<LegalLocale, [string, string, string]> = {
  fr: ['CGUV', 'Confidentialité', 'Mentions légales'],
  en: ['Terms', 'Privacy', 'Legal Notice'],
};

const UPDATED_LABEL: Record<LegalLocale, string> = {
  fr: 'Dernière mise à jour',
  en: 'Last updated',
};

function docText(locale: LegalLocale, doc: string): string | null {
  const docs = LEGAL[locale];
  if (doc === 'terms') return docs.terms;
  if (doc === 'privacy') return docs.privacy;
  if (doc === 'mentions') return docs.notice;
  return null;
}

function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** Rendu HTML du markdown léger des textes (## titres, listes -, paragraphes). */
function renderBody(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('## ')) return `<h2>${escapeHtml(trimmed.slice(3))}</h2>`;
      if (trimmed.startsWith('- ')) {
        const items = trimmed
          .split('\n')
          .map((line) => `<li>${escapeHtml(line.replace(/^- /, ''))}</li>`)
          .join('');
        return `<ul>${items}</ul>`;
      }
      return `<p>${escapeHtml(trimmed).replaceAll('\n', '<br/>')}</p>`;
    })
    .join('\n');
}

function page(locale: LegalLocale, doc: string, title: string, text: string): string {
  const [navTerms, navPrivacy, navMentions] = NAV_LABELS[locale];
  const qs = locale === 'en' ? '?lang=en' : '';
  const langSwitch =
    locale === 'en'
      ? `<a href="/legal/${doc}">Version française (fait foi)</a>`
      : `<a href="/legal/${doc}?lang=en">English version</a>`;
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)} — Watchy</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1b2531;
         background: #eef1f5; margin: 0; padding: 24px 16px; line-height: 1.55; }
  main { max-width: 720px; margin: 0 auto; background: #ffffff; border-radius: 16px;
         padding: 32px 28px; box-shadow: 0 4px 24px rgba(27,37,49,0.08); }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 17px; margin: 28px 0 8px; }
  p, li { font-size: 15px; color: #3c4654; }
  .updated { color: #7b8794; font-size: 13px; margin-bottom: 24px; }
  nav { margin-top: 32px; font-size: 13px; }
  nav a { color: #5b7fa6; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p class="updated">${UPDATED_LABEL[locale]} : ${escapeHtml(LEGAL[locale].updated)} · ${langSwitch}</p>
${renderBody(text)}
<nav>
  <a href="/legal/terms${qs}">${navTerms}</a> · <a href="/legal/privacy${qs}">${navPrivacy}</a> · <a href="/legal/mentions${qs}">${navMentions}</a>
</nav>
</main>
</body>
</html>`;
}

router.get('/:doc', (c) => {
  const doc = c.req.param('doc');
  const locale: LegalLocale = c.req.query('lang') === 'en' ? 'en' : 'fr';
  const text = docText(locale, doc);
  if (!text) return c.text('Not found', 404);
  return c.html(page(locale, doc, TITLES[locale][doc], text));
});

export { router as legalRouter };
