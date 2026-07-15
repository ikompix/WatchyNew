import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { and, count, desc, eq, gt, inArray, notInArray, or, sql as dsql } from 'drizzle-orm';
import { gte } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  acquisitionSources,
  adminTokens,
  aiUsage,
  bannedUsers,
  consumablePurchases,
  entitlements,
  priceAlerts,
  profiles,
  pushCampaigns,
  pushTokens,
  recognitionEvents,
  watches,
  wishlistItems,
} from '../db/schema.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { sendExpoPush } from '../lib/push.js';
import { premiumUserIds } from '../lib/entitlements.js';
import { invalidateBanCache } from '../lib/bans.js';
import type { AuthUser } from './admin-shared.js';
import {
  COOKIE,
  daysAgo,
  esc,
  isGuest,
  isMaster,
  isTest,
  isValidToken,
  kpis,
  layout,
  listAllUsers,
  loginPage,
  maskEmail,
  sha256,
} from './admin-shared.js';
import { adminMarketingRouter } from './admin-marketing.js';

// Back office : pages HTML server-rendered, protégées par ADMIN_TOKEN (cookie
// httpOnly posé via le mini formulaire de connexion). Zéro dépendance front.
// Les gabarits et helpers partagés vivent dans admin-shared.ts.

const router = new Hono();

const PRICE_MONTHLY = 4.99;
const PRICE_ANNUAL = 39.99;
// Packs consommables (prix ASC bruts)
const CONSUMABLE_PRICES: Record<string, number> = {
  watchy_watch_slot_1: 1.99,
  watchy_wishlist_slot_1: 1.99,
};

router.post('/login', async (c) => {
  const body = await c.req.parseBody();
  const token = String(body.token ?? '');
  if (!(await isValidToken(token))) {
    return c.html(loginPage('Jeton incorrect ou révoqué.'), 401);
  }
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 30 * 24 * 3600,
    path: '/admin',
  });
  return c.redirect('/admin');
});

router.use('*', async (c, next) => {
  if (c.req.path.endsWith('/login')) return next();
  if (!process.env.ADMIN_TOKEN) return c.text('ADMIN_TOKEN non configuré', 503);
  if (!(await isValidToken(getCookie(c, COOKIE)))) return c.html(loginPage());
  return next();
});

// Onglet marketing (fichier séparé) — monté après le middleware d'auth,
// il hérite donc de la protection par cookie
router.route('/marketing', adminMarketingRouter);

// --- Helpers d'agrégation ---------------------------------------------------

const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
const usd = (n: number) => `$${n.toFixed(2)}`;

/** Barres horizontales SVG (label, valeur) triées décroissant. */
function hbars(rows: Array<{ label: string; value: number }>, unit = ''): string {
  if (!rows.length) return '<p class="muted">Aucune donnée pour l\'instant.</p>';
  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((s, r) => s + r.value, 0);
  return `<div class="bars">${rows
    .map((r) => {
      const pct = total ? Math.round((r.value / total) * 100) : 0;
      return `<div class="bar-row"><span class="bar-label">${r.label}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(r.value / max) * 100}%"></span></span>
        <span class="bar-value">${r.value.toLocaleString('fr-FR')}${unit} · ${pct}%</span></div>`;
    })
    .join('')}</div>`;
}

/** Courbe/colonnes 30 jours en SVG (une valeur par jour, plus ancien à gauche). */
function chart30(days: number[]): string {
  const max = Math.max(...days, 1);
  const w = 600;
  const bw = w / days.length;
  const bars = days
    .map((v, i) => {
      const h = Math.round((v / max) * 90);
      return `<rect x="${(i * bw + 1).toFixed(1)}" y="${100 - h}" width="${(bw - 2).toFixed(1)}" height="${h}" rx="2" fill="#4C6FFF"/>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${w} 110" class="chart" preserveAspectRatio="none">${bars}
    <text x="2" y="10" class="chart-max">${max}</text></svg>`;
}

/** Compte les valeurs non nulles et les mappe en libellés triés décroissant. */
function tally(values: Array<string | null>, labels: Record<string, string>) {
  const map = new Map<string, number>();
  for (const v of values) if (v) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map.entries()]
    .map(([k, value]) => ({ label: labels[k] ?? k, value }))
    .sort((a, b) => b.value - a.value);
}

/** Compte par jour (UTC) sur les n derniers jours. */
function perDay(dates: Date[], n: number): number[] {
  const buckets = new Array(n).fill(0);
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  for (const d of dates) {
    const diff = Math.floor((start.getTime() - new Date(d).setUTCHours(0, 0, 0, 0)) / 86400000);
    if (diff >= 0 && diff < n) buckets[n - 1 - diff]++;
  }
  return buckets;
}

// --- Pages -------------------------------------------------------------------

router.get('/', async (c) => {
  const [users, [nbWatches], [nbWishlist], [scansMonth]] = await Promise.all([
    listAllUsers(),
    db.select({ n: count() }).from(watches),
    db.select({ n: count() }).from(wishlistItems),
    db
      .select({ n: count() })
      .from(recognitionEvents)
      .where(gte(recognitionEvents.createdAt, new Date(new Date().setUTCDate(1)))),
  ]);
  const real = users.filter((u) => !isTest(u));
  const guests = real.filter(isGuest);
  const accounts = real.filter((u) => !isGuest(u));
  const last24 = real.filter((u) => new Date(u.created_at) > daysAgo(1)).length;
  const last7 = real.filter((u) => new Date(u.created_at) > daysAgo(7)).length;
  const active7 = real.filter(
    (u) => u.last_sign_in_at && new Date(u.last_sign_in_at) > daysAgo(7)
  ).length;

  return c.html(
    layout(
      'overview',
      `${kpis([
        ['Inscrits', String(real.length), `dont ${guests.length} invités`],
        ['+24 h', `+${last24}`, ''],
        ['+7 j', `+${last7}`, ''],
        ['Actifs 7 j', String(active7), `${real.length ? Math.round((active7 / real.length) * 100) : 0}% des inscrits`],
      ])}
      <section><h2>Inscriptions — 30 derniers jours</h2>
      ${chart30(perDay(real.map((u) => new Date(u.created_at)), 30))}</section>
      ${kpis([
        ['Comptes réels', String(accounts.length), 'hors invités'],
        ['Montres', String(nbWatches.n), 'en collection'],
        ['Wishlist', String(nbWishlist.n), 'items'],
        ['Scans ce mois', String(scansMonth.n), 'reconnaissances IA'],
      ])}`
    )
  );
});

router.get('/acquisition', async (c) => {
  const [users, sources, profileRows] = await Promise.all([
    listAllUsers(),
    db.select().from(acquisitionSources),
    db.select().from(profiles),
  ]);
  const real = users.filter((u) => !isTest(u));
  const accounts = real.filter((u) => !isGuest(u));

  const LABELS: Record<string, string> = {
    tiktok: 'TikTok',
    instagram: 'Instagram',
    app_store: 'App Store',
    bouche_a_oreille: 'Bouche-à-oreille',
    ami_collectionneur: 'Un ami collectionneur',
    presse: 'Presse / blog',
    autre: 'Autre',
  };
  const bySource = new Map<string, number>();
  for (const s of sources) bySource.set(s.source, (bySource.get(s.source) ?? 0) + 1);
  const rows = [...bySource.entries()]
    .map(([k, v]) => ({ label: LABELS[k] ?? k, value: v }))
    .sort((a, b) => b.value - a.value);
  const answered = sources.length;
  const rate = accounts.length ? Math.round((answered / accounts.length) * 100) : 0;

  return c.html(
    layout(
      'acquisition',
      `${kpis([
        ['Réponses', String(answered), `sur ${accounts.length} comptes`],
        ['Taux de réponse', `${rate}%`, 'à « Comment nous avez-vous connu ? »'],
      ])}
      <section><h2>Sources d'acquisition</h2>${hbars(rows)}</section>
      <section><h2>Connaissance horlogère</h2>${hbars(tally(profileRows.map((p) => p.expertise), {
        novice: 'Novice', passionne: 'Passionné', collectionneur: 'Collectionneur', metier: 'Métier',
      }))}</section>
      <section><h2>Tranches d'âge</h2>${hbars(tally(profileRows.map((p) => p.ageRange), {}))}</section>
      <section><h2>Inscriptions / jour — 30 j</h2>
      ${chart30(perDay(real.map((u) => new Date(u.created_at)), 30))}</section>`
    )
  );
});

router.get('/revenue', async (c) => {
  const now = new Date();
  const [premiums, users, packs30, packsAll] = await Promise.all([
    db.select().from(entitlements).where(eq(entitlements.plan, 'premium')),
    listAllUsers(),
    db
      .select({ productId: consumablePurchases.productId, n: count() })
      .from(consumablePurchases)
      .where(and(gt(consumablePurchases.quantity, 0), gte(consumablePurchases.createdAt, daysAgo(30))))
      .groupBy(consumablePurchases.productId),
    db
      .select({ productId: consumablePurchases.productId, n: count() })
      .from(consumablePurchases)
      .where(gt(consumablePurchases.quantity, 0))
      .groupBy(consumablePurchases.productId),
  ]);
  const active = premiums.filter((p) => !p.expiresAt || p.expiresAt > now);
  const annual = active.filter((p) => /annual|year/i.test(p.productId ?? '')).length;
  const monthly = active.length - annual;
  const mrr = monthly * PRICE_MONTHLY + (annual * PRICE_ANNUAL) / 12;
  const accounts = users.filter((u) => !isTest(u) && !isGuest(u));
  const conversion = accounts.length ? ((active.length / accounts.length) * 100).toFixed(1) : '0';

  const packRevenue = (rows: { productId: string; n: number }[]) =>
    rows.reduce((sum, r) => sum + (CONSUMABLE_PRICES[r.productId] ?? 0) * r.n, 0);
  const packsSold30 = packs30.reduce((sum, r) => sum + r.n, 0);
  const packRows = packsAll
    .map(
      (r) =>
        `<tr><td>${esc(r.productId)}</td><td>${r.n}</td><td>${eur((CONSUMABLE_PRICES[r.productId] ?? 0) * r.n)}</td></tr>`
    )
    .join('');

  return c.html(
    layout(
      'revenue',
      `${kpis([
        ['Premium actifs', String(active.length), `${monthly} mensuels · ${annual} annuels`],
        ['Conversion', `${conversion}%`, `${active.length} premium / ${accounts.length} comptes`],
        ['MRR estimé', eur(mrr), 'mensuel + annuel/12'],
        ['Revenu annualisé', eur(mrr * 12), 'ARR estimé'],
        ['Packs vendus 30 j', String(packsSold30), 'emplacements collection + wishlist'],
        ['Revenu packs 30 j', eur(packRevenue(packs30)), 'one-shot, hors MRR'],
      ])}
      ${packsAll.length ? `<section><h2>Consommables (depuis le lancement)</h2><table><tr><th>Produit</th><th>Ventes</th><th>Revenu brut</th></tr>${packRows}</table></section>` : ''}
      <p class="muted">Montants bruts App Store — la commission Apple (15-30 %) n'est pas déduite.</p>`
    )
  );
});

router.get('/costs', async (c) => {
  const alertThreshold = Number(process.env.COST_ALERT_DAILY_USD ?? 5);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const sumSince = async (since: Date | null) => {
    const [row] = await db
      .select({ total: dsql<string>`coalesce(sum(${aiUsage.costUsd}), 0)`, n: count() })
      .from(aiUsage)
      .where(since ? gte(aiUsage.createdAt, since) : undefined);
    return { total: Number(row.total), n: row.n };
  };
  const [dToday, d7, d30, dAll, byLabel, top, premActive, allRows] = await Promise.all([
    sumSince(today),
    sumSince(daysAgo(7)),
    sumSince(daysAgo(30)),
    sumSince(null),
    db
      .select({ label: aiUsage.label, total: dsql<string>`sum(${aiUsage.costUsd})`, n: count() })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, daysAgo(30)))
      .groupBy(aiUsage.label),
    db.select().from(aiUsage).orderBy(desc(aiUsage.costUsd)).limit(10),
    db.select({ n: count() }).from(entitlements).where(eq(entitlements.plan, 'premium')),
    db.select({ userId: aiUsage.userId }).from(aiUsage).where(gte(aiUsage.createdAt, daysAgo(30))),
  ]);

  const activeSpenders = new Set(allRows.map((r) => r.userId).filter(Boolean)).size;
  const costPerUser = activeSpenders ? d30.total / activeSpenders : 0;
  // Approximation 1 USD ≈ 1 EUR (marge de sécurité : l'euro vaut plus)
  const revenue30 =
    premActive[0].n * PRICE_MONTHLY; /* approx : les annuels comptent comme 1 mois */
  const margin = revenue30 - d30.total;

  const opRows = byLabel
    .map((r) => {
      const family = r.label.split(' ')[0]; // cote / rapport / reco
      return { family, total: Number(r.total), n: r.n };
    })
    .reduce((acc, r) => {
      const cur = acc.get(r.family) ?? { total: 0, n: 0 };
      acc.set(r.family, { total: cur.total + r.total, n: cur.n + r.n });
      return acc;
    }, new Map<string, { total: number; n: number }>());

  return c.html(
    layout(
      'costs',
      `${dToday.total > alertThreshold ? `<div class="alert">⚠️ Coût du jour ${usd(dToday.total)} — au-dessus du seuil de ${usd(alertThreshold)}</div>` : ''}
      ${kpis([
        ["Aujourd'hui", usd(dToday.total), `${dToday.n} appel(s)`],
        ['7 jours', usd(d7.total), `${d7.n} appel(s)`],
        ['30 jours', usd(d30.total), `${d30.n} appel(s)`],
        ['Total', usd(dAll.total), `${dAll.n} appel(s)`],
      ])}
      ${kpis([
        ['Coût / utilisateur', usd(costPerUser), `${activeSpenders} utilisateur(s) consommateur(s) · 30 j`],
        ['Revenus 30 j (est.)', eur(revenue30), 'abonnements + rapports'],
        ['Marge 30 j (est.)', eur(margin), margin >= 0 ? '✓ rentable' : '✗ à perte'],
        ['ROI', revenue30 ? `${Math.round((margin / Math.max(d30.total, 0.01)) * 100)}%` : '—', 'marge / coûts'],
      ])}
      <section><h2>Par type d'opération — 30 j</h2>
      ${hbars([...opRows.entries()].map(([label, v]) => ({ label: `${label} (${v.n})`, value: Math.round(v.total * 100) })).sort((a, b) => b.value - a.value), ' ct')}</section>
      <section><h2>Top 10 des appels les plus chers</h2>
      <table><tr><th>Date</th><th>Opération</th><th>Modèle</th><th>Coût</th><th>Recherches</th></tr>
      ${top.map((r) => `<tr><td>${r.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</td><td>${r.label}</td><td>${r.model.replace('claude-', '')}</td><td>${usd(Number(r.costUsd))}</td><td>${r.searches}</td></tr>`).join('')}
      </table></section>`
    )
  );
});

router.get('/users', async (c) => {
  const q = (c.req.query('q') ?? '').trim().toLowerCase();
  const [users, plans, sources, watchCounts, costs] = await Promise.all([
    listAllUsers(),
    db.select().from(entitlements),
    db.select().from(acquisitionSources),
    db.select({ userId: watches.userId, n: count() }).from(watches).groupBy(watches.userId),
    db
      .select({ userId: aiUsage.userId, total: dsql<string>`sum(${aiUsage.costUsd})` })
      .from(aiUsage)
      .groupBy(aiUsage.userId),
  ]);
  const planBy = new Map(plans.map((p) => [p.userId, p.plan]));
  const srcBy = new Map(sources.map((s) => [s.userId, s.source]));
  const watchBy = new Map(watchCounts.map((w) => [w.userId, w.n]));
  const costBy = new Map(costs.filter((x) => x.userId).map((x) => [x.userId!, Number(x.total)]));

  const master = isMaster(c);
  const matches = users
    .filter((u) => !isTest(u))
    .filter((u) => !q || u.email?.toLowerCase().includes(q) || u.id === q)
    .sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
  const rows = matches
    .slice(0, 50)
    .map((u) => {
      const premium = planBy.get(u.id) === 'premium';
      const plan = premium ? '⭐ premium' : isGuest(u) ? 'invité' : 'free';
      const action = !master
        ? ''
        : premium
          ? `<form method="post" action="/admin/users/premium" style="margin:0"><input type="hidden" name="userId" value="${u.id}"/><input type="hidden" name="action" value="revoke"/><button class="danger">Retirer</button></form>`
          : `<form method="post" action="/admin/users/premium" style="margin:0"><input type="hidden" name="userId" value="${u.id}"/><input type="hidden" name="action" value="grant"/><button>⭐ Premium</button></form>`;
      return `<tr><td><a href="/admin/users/${u.id}">${master ? esc(u.email ?? '—') : maskEmail(u.email)}</a></td><td>${u.created_at.slice(0, 10)}</td><td>${plan}</td>
        <td>${srcBy.get(u.id) ?? '—'}</td><td>${watchBy.get(u.id) ?? 0}</td>
        <td>${costBy.has(u.id) ? usd(costBy.get(u.id)!) : '—'}</td><td>${action}</td></tr>`;
    })
    .join('');

  return c.html(
    layout(
      'users',
      `<section><h2>Rechercher un utilisateur</h2>
      <form method="get" action="/admin/users" class="inline-form">
      <input name="q" value="${esc(q)}" placeholder="E-mail (partiel) ou ID utilisateur"/>
      <button type="submit">Rechercher</button></form></section>
      <section><h2>${q ? `Résultats — ${matches.length}${matches.length > 50 ? ' (50 premiers affichés)' : ''}` : '50 derniers inscrits'}</h2>
      ${master ? '<p class="muted">« ⭐ Premium » accorde un accès promo (sans paiement, sans expiration) — pour vos testeurs. « Retirer » repasse en gratuit. Cliquez sur un e-mail pour la fiche détaillée.</p>' : ''}
      ${rows ? `<table><tr><th>E-mail</th><th>Inscrit le</th><th>Plan</th><th>Source</th><th>Montres</th><th>Coût IA</th><th></th></tr>${rows}</table>` : '<p class="muted">Aucun utilisateur trouvé.</p>'}</section>`
    )
  );
});

// --- Fiche utilisateur ---------------------------------------------------------

const EXPERTISE_LABELS: Record<string, string> = {
  novice: 'Novice',
  passionne: 'Passionné',
  collectionneur: 'Collectionneur',
  metier: 'Métier',
};

router.get('/users/:id', async (c) => {
  const id = c.req.param('id');
  const errorMsg = c.req.query('error');
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
  if (error || !data.user) {
    return c.html(
      layout('users', `<section><p class="muted">Utilisateur introuvable.</p><p><a href="/admin/users">← Utilisateurs</a></p></section>`),
      404
    );
  }
  const u = data.user;

  const [[ent], [profile], [src], [nbWatches], [nbWishlist], [nbScans], [ai], [ban]] =
    await Promise.all([
      db.select().from(entitlements).where(eq(entitlements.userId, id)).limit(1),
      db.select().from(profiles).where(eq(profiles.userId, id)).limit(1),
      db.select().from(acquisitionSources).where(eq(acquisitionSources.userId, id)).limit(1),
      db.select({ n: count() }).from(watches).where(eq(watches.userId, id)),
      db.select({ n: count() }).from(wishlistItems).where(eq(wishlistItems.userId, id)),
      db.select({ n: count() }).from(recognitionEvents).where(eq(recognitionEvents.userId, id)),
      db
        .select({ total: dsql<string>`coalesce(sum(${aiUsage.costUsd}), 0)`, n: count() })
        .from(aiUsage)
        .where(eq(aiUsage.userId, id)),
      db.select().from(bannedUsers).where(eq(bannedUsers.userId, id)).limit(1),
    ]);

  const master = isMaster(c);
  const premium = ent?.plan === 'premium';
  const plan = premium ? '⭐ premium' : isGuest(u as AuthUser) ? 'invité' : 'free';
  const fmtDate = (v?: string | Date | null) =>
    v ? new Date(v).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : '—';

  const identity: Array<[string, string]> = [
    ['E-mail', master ? esc(u.email ?? '—') : maskEmail(u.email ?? undefined)],
    ['ID', u.id],
    ['Inscrit le', fmtDate(u.created_at)],
    ['Dernière connexion', fmtDate(u.last_sign_in_at)],
    ['Plan', `${plan}${ent?.source ? ` · ${esc(ent.source)}` : ''}${ent?.productId ? ` · ${esc(ent.productId)}` : ''}`],
    ['Expiration abonnement', ent?.expiresAt ? fmtDate(ent.expiresAt) : '—'],
    ['Emplacements achetés', `${ent?.extraWatchSlots ?? 0} collection · ${ent?.extraWishlistSlots ?? 0} wishlist`],
    ['Source d\'acquisition', src ? esc(src.source) : '—'],
    ['Profil', profile
      ? esc([profile.expertise ? (EXPERTISE_LABELS[profile.expertise] ?? profile.expertise) : null, profile.ageRange, profile.city, profile.country].filter(Boolean).join(' · ')) || '—'
      : '—'],
    ['Statut', ban
      ? `🚫 banni le ${fmtDate(ban.createdAt)}${ban.reason ? ` — ${esc(ban.reason)}` : ''}`
      : '✓ actif'],
  ];

  const actions = !master
    ? ''
    : `<section><h2>Actions</h2><div class="push-row">
      ${premium
        ? `<form method="post" action="/admin/users/premium" style="margin:0"><input type="hidden" name="userId" value="${u.id}"/><input type="hidden" name="action" value="revoke"/><input type="hidden" name="redirect" value="/admin/users/${u.id}"/><button class="danger">Retirer premium</button></form>`
        : `<form method="post" action="/admin/users/premium" style="margin:0"><input type="hidden" name="userId" value="${u.id}"/><input type="hidden" name="action" value="grant"/><input type="hidden" name="redirect" value="/admin/users/${u.id}"/><button>⭐ Premium promo</button></form>`}
      ${ban
        ? `<form method="post" action="/admin/users/unban" style="margin:0"><input type="hidden" name="userId" value="${u.id}"/><button class="ghost">Débannir</button></form>`
        : `<form method="post" action="/admin/users/ban" style="margin:0;display:flex;gap:8px;flex:1"
            onsubmit="return confirm('Bannir ce compte ? Connexion et API bloquées immédiatement (réversible, données conservées).')">
            <input type="hidden" name="userId" value="${u.id}"/>
            <input name="reason" placeholder="Raison (facultatif)" maxlength="200" style="flex:1;border:1px solid #d7dee6;border-radius:10px;padding:8px 12px;font-size:13px"/>
            <button class="danger">🚫 Bannir</button></form>`}
      </div>
      <p class="muted">Le ban bloque la connexion (Supabase) et coupe les sessions en cours (API). Les données sont conservées.</p></section>`;

  return c.html(
    layout(
      'users',
      `${errorMsg ? `<div class="alert">${esc(errorMsg)}</div>` : ''}
      <p><a href="/admin/users">← Utilisateurs</a></p>
      ${kpis([
        ['Plan', plan, ban ? '🚫 banni' : ''],
        ['Montres', String(nbWatches.n), 'en collection'],
        ['Wishlist', String(nbWishlist.n), 'items'],
        ['Scans', String(nbScans.n), 'reconnaissances IA'],
        ['Coût IA', usd(Number(ai.total)), `${ai.n} appel(s)`],
      ])}
      <section><h2>Identité</h2>
      <table>${identity.map(([k, v]) => `<tr><th style="width:220px">${k}</th><td>${v}</td></tr>`).join('')}</table></section>
      ${actions}`
    )
  );
});

router.post('/users/ban', async (c) => {
  if (!isMaster(c)) return c.text('Réservé au jeton maître', 403);
  const body = await c.req.parseBody();
  const userId = String(body.userId ?? '');
  const reason = String(body.reason ?? '').trim().slice(0, 200) || null;
  if (!userId) return c.redirect('/admin/users');
  // GoTrue d'abord (bloque connexion + refresh) ; en cas d'échec on n'écrit
  // rien en local pour ne pas créer d'état incohérent
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: '876600h', // ~100 ans
  });
  if (error) {
    return c.redirect(`/admin/users/${userId}?error=${encodeURIComponent(`Ban Supabase impossible : ${error.message}`)}`);
  }
  await db.insert(bannedUsers).values({ userId, reason }).onConflictDoNothing();
  invalidateBanCache();
  console.log(`[admin] ban ${userId}${reason ? ` (${reason})` : ''}`);
  return c.redirect(`/admin/users/${userId}`);
});

router.post('/users/unban', async (c) => {
  if (!isMaster(c)) return c.text('Réservé au jeton maître', 403);
  const body = await c.req.parseBody();
  const userId = String(body.userId ?? '');
  if (!userId) return c.redirect('/admin/users');
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
  if (error) {
    return c.redirect(`/admin/users/${userId}?error=${encodeURIComponent(`Débannissement Supabase impossible : ${error.message}`)}`);
  }
  await db.delete(bannedUsers).where(eq(bannedUsers.userId, userId));
  invalidateBanCache();
  console.log(`[admin] unban ${userId}`);
  return c.redirect(`/admin/users/${userId}`);
});

// --- Équipe (jeton maître uniquement) -----------------------------------------

router.get('/team', async (c) => {
  if (!isMaster(c)) {
    return c.html(layout('team', `<section><p class="muted">Réservé au jeton maître.</p></section>`));
  }
  const created = c.req.query('created');
  const tokens = await db.select().from(adminTokens).orderBy(desc(adminTokens.createdAt));
  const rows = tokens
    .map(
      (t) => `<tr><td>${t.label}</td><td>${t.createdAt.toISOString().slice(0, 10)}</td>
      <td>${t.revokedAt ? `révoqué le ${t.revokedAt.toISOString().slice(0, 10)}` : '✓ actif'}</td>
      <td>${t.revokedAt ? '' : `<form method="post" action="/admin/team/revoke" style="margin:0"><input type="hidden" name="id" value="${t.id}"/><button class="danger">Révoquer</button></form>`}</td></tr>`
    )
    .join('');

  return c.html(
    layout(
      'team',
      `${created ? `<div class="alert ok">Accès créé — transmettez ce jeton (il ne sera plus jamais affiché) :<br/><code>${created}</code></div>` : ''}
      <section><h2>Inviter un collègue</h2>
      <p class="muted">Chaque personne reçoit son propre jeton, révocable individuellement. Les jetons d'équipe donnent accès aux dashboards en lecture — pas à cette page ni aux actions premium.</p>
      <form method="post" action="/admin/team/create" class="inline-form">
      <input name="label" placeholder="Prénom / rôle (ex. Julien — testeur)" required maxlength="60"/>
      <button type="submit">Générer un jeton</button></form></section>
      <section><h2>Jetons d'équipe</h2>
      ${tokens.length ? `<table><tr><th>Label</th><th>Créé le</th><th>Statut</th><th></th></tr>${rows}</table>` : '<p class="muted">Aucun jeton pour l\'instant.</p>'}</section>`
    )
  );
});

router.post('/team/create', async (c) => {
  if (!isMaster(c)) return c.text('Réservé au jeton maître', 403);
  const body = await c.req.parseBody();
  const label = String(body.label ?? '').trim();
  if (!label) return c.redirect('/admin/team');
  const token = randomBytes(24).toString('hex');
  await db.insert(adminTokens).values({ label, tokenHash: sha256(token) });
  console.log(`[admin] jeton d'équipe créé: ${label}`);
  return c.redirect(`/admin/team?created=${token}`);
});

router.post('/team/revoke', async (c) => {
  if (!isMaster(c)) return c.text('Réservé au jeton maître', 403);
  const body = await c.req.parseBody();
  await db
    .update(adminTokens)
    .set({ revokedAt: new Date() })
    .where(eq(adminTokens.id, String(body.id)));
  return c.redirect('/admin/team');
});

// --- Notifications push (jeton maître uniquement) ------------------------------
// Campagnes/annonces manuelles composées ici. Seule exception automatique dans
// le code : les alertes de cote premium (lib/price-alerts.ts), greffées sur
// les refreshs de cote déjà déclenchés.

const PUSH_SEGMENTS = ['all', 'premium', 'free', 'test'] as const;
type PushSegment = (typeof PUSH_SEGMENTS)[number];
const SEGMENT_LABELS: Record<PushSegment, string> = {
  all: 'Tous',
  premium: 'Premium',
  free: 'Free',
  test: 'Test (e-mail)',
};

/** Jetons ciblés par segment ; test = les appareils d'un seul compte (e-mail). */
async function tokensForSegment(segment: PushSegment, email: string): Promise<string[]> {
  if (segment === 'test') {
    const wanted = email.trim().toLowerCase();
    if (!wanted) return [];
    const user = (await listAllUsers()).find((u) => u.email?.toLowerCase() === wanted);
    if (!user) return [];
    const rows = await db
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .where(eq(pushTokens.userId, user.id));
    return rows.map((r) => r.token);
  }
  if (segment === 'premium' || segment === 'free') {
    const premium = await premiumUserIds();
    if (segment === 'premium' && !premium.length) return [];
    const rows = await db
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .where(
        segment === 'premium'
          ? inArray(pushTokens.userId, premium)
          : premium.length
            ? notInArray(pushTokens.userId, premium)
            : undefined
      );
    return rows.map((r) => r.token);
  }
  const rows = await db.select({ token: pushTokens.token }).from(pushTokens);
  return rows.map((r) => r.token);
}

router.get('/push', async (c) => {
  if (!isMaster(c)) {
    return c.html(layout('push', `<section><p class="muted">Réservé au jeton maître.</p></section>`));
  }
  const sent = c.req.query('sent');
  const purged = Number(c.req.query('purged') ?? 0);
  const error = c.req.query('error');

  const [[allCount], premium, campaigns, [alerts30]] = await Promise.all([
    db.select({ n: count() }).from(pushTokens),
    premiumUserIds(),
    db.select().from(pushCampaigns).orderBy(desc(pushCampaigns.createdAt)).limit(20),
    db.select({ n: count() }).from(priceAlerts).where(gte(priceAlerts.createdAt, daysAgo(30))),
  ]);
  const [premCount] = premium.length
    ? await db.select({ n: count() }).from(pushTokens).where(inArray(pushTokens.userId, premium))
    : [{ n: 0 }];

  const history = campaigns
    .map(
      (p) => `<tr><td>${p.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</td>
      <td>${SEGMENT_LABELS[p.segment as PushSegment] ?? esc(p.segment)}</td>
      <td>${esc(p.title)}</td><td>${esc(p.body)}</td><td>${p.recipients}</td></tr>`
    )
    .join('');

  return c.html(
    layout(
      'push',
      `${error ? `<div class="alert">${esc(error)}</div>` : ''}
      ${sent != null ? `<div class="alert ok">Notification envoyée à ${sent} appareil(s)${purged ? ` · ${purged} jeton(s) expiré(s) purgé(s)` : ''}.</div>` : ''}
      ${kpis([
        ['Appareils inscrits', String(allCount.n), 'jetons push actifs'],
        ['Premium', String(premCount.n), 'appareils'],
        ['Free', String(allCount.n - premCount.n), 'appareils'],
        ['Alertes de cote 30 j', String(alerts30.n), 'envois automatiques premium'],
      ])}
      <section><h2>Envoyer une notification</h2>
      <p class="muted">Envoi immédiat et manuel — réfléchissez avant de cliquer, il n'y a pas d'annulation.
      Commencez toujours par le segment « Test » vers votre propre compte.</p>
      <form method="post" action="/admin/push" class="push-form"
        onsubmit="return confirm('Envoyer « ' + this.title.value + ' » au segment ' + this.segment.options[this.segment.selectedIndex].text + ' ?')">
      <input name="title" placeholder="Titre (ex. Nouveautés Watchy)" required maxlength="65"/>
      <textarea name="body" placeholder="Message (visible en entier sur l'écran verrouillé — court et concret)" required maxlength="240" rows="3"></textarea>
      <div class="push-row">
        <select name="segment">${PUSH_SEGMENTS.map((s) => `<option value="${s}"${s === 'test' ? ' selected' : ''}>${SEGMENT_LABELS[s]}</option>`).join('')}</select>
        <input name="email" type="email" placeholder="E-mail du compte test (segment Test uniquement)"/>
      </div>
      <button type="submit">Envoyer</button></form></section>
      <section><h2>Dernières campagnes</h2>
      ${campaigns.length ? `<table><tr><th>Date</th><th>Segment</th><th>Titre</th><th>Message</th><th>Envoyés</th></tr>${history}</table>` : '<p class="muted">Aucune campagne pour l\'instant.</p>'}</section>`
    )
  );
});

router.post('/push', async (c) => {
  if (!isMaster(c)) return c.text('Réservé au jeton maître', 403);
  const body = await c.req.parseBody();
  const title = String(body.title ?? '').trim().slice(0, 65);
  const message = String(body.body ?? '').trim().slice(0, 240);
  const segment = PUSH_SEGMENTS.includes(String(body.segment) as PushSegment)
    ? (String(body.segment) as PushSegment)
    : 'test';
  const email = String(body.email ?? '');

  if (!title || !message) return c.redirect('/admin/push?error=Titre et message requis.');
  if (segment === 'test' && !email.trim())
    return c.redirect('/admin/push?error=Le segment Test exige un e-mail.');

  const tokens = await tokensForSegment(segment, email);
  const { sent, invalid } = await sendExpoPush(tokens, title, message);
  if (invalid.length) await db.delete(pushTokens).where(inArray(pushTokens.token, invalid));
  await db.insert(pushCampaigns).values({ title, body: message, segment, recipients: sent });
  console.log(`[admin] push « ${title} » segment=${segment} envoyés=${sent} purgés=${invalid.length}`);
  return c.redirect(`/admin/push?sent=${sent}&purged=${invalid.length}`);
});

// --- Premium promo (jeton maître uniquement) ----------------------------------

router.post('/users/premium', async (c) => {
  if (!isMaster(c)) return c.text('Réservé au jeton maître', 403);
  const body = await c.req.parseBody();
  const userId = String(body.userId ?? '');
  const action = String(body.action ?? '');
  // Retour vers la fiche détail quand l'action vient de là (chemin admin only)
  const redirect = String(body.redirect ?? '').startsWith('/admin/') ? String(body.redirect) : '/admin/users';
  if (!userId) return c.redirect('/admin/users');
  if (action === 'grant') {
    await db
      .insert(entitlements)
      .values({ userId, plan: 'premium', source: 'promo', productId: 'promo' })
      .onConflictDoUpdate({
        target: entitlements.userId,
        set: { plan: 'premium', source: 'promo', productId: 'promo', expiresAt: null, updatedAt: new Date() },
      });
    console.log(`[admin] premium promo accordé à ${userId}`);
  } else if (action === 'revoke') {
    await db
      .update(entitlements)
      .set({ plan: 'free', updatedAt: new Date() })
      .where(eq(entitlements.userId, userId));
    console.log(`[admin] premium retiré à ${userId}`);
  }
  return c.redirect(redirect);
});

export { router as adminRouter };
