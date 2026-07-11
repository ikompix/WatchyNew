import { createHash, randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { and, count, desc, eq, gt, inArray, isNull, notInArray, or, sql as dsql } from 'drizzle-orm';
import { gte } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  acquisitionSources,
  adminTokens,
  aiUsage,
  entitlements,
  profiles,
  pushCampaigns,
  pushTokens,
  recognitionEvents,
  watches,
  wishlistItems,
} from '../db/schema.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { sendExpoPush } from '../lib/push.js';

// Back office : pages HTML server-rendered, protégées par ADMIN_TOKEN (cookie
// httpOnly posé via le mini formulaire de connexion). Zéro dépendance front.

const router = new Hono();

const COOKIE = 'watchy_admin';
const PRICE_MONTHLY = 4.99;
const PRICE_ANNUAL = 39.99;

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

// Jeton maître (env) = tous les droits ; jetons d'équipe (DB, hachés,
// révocables) = lecture des dashboards uniquement
const isMaster = (c: Context) =>
  Boolean(process.env.ADMIN_TOKEN) && getCookie(c, COOKIE) === process.env.ADMIN_TOKEN;

async function isValidToken(token: string | undefined): Promise<boolean> {
  if (!token || !process.env.ADMIN_TOKEN) return false;
  if (token === process.env.ADMIN_TOKEN) return true;
  const [row] = await db
    .select({ id: adminTokens.id })
    .from(adminTokens)
    .where(and(eq(adminTokens.tokenHash, sha256(token)), isNull(adminTokens.revokedAt)))
    .limit(1);
  return Boolean(row);
}

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

// --- Helpers d'agrégation ---------------------------------------------------

interface AuthUser {
  id: string;
  email?: string;
  created_at: string;
  last_sign_in_at?: string;
}

async function listAllUsers(): Promise<AuthUser[]> {
  const users: AuthUser[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw error;
    users.push(...(data.users as AuthUser[]));
    if (data.users.length < 500) break;
  }
  return users;
}

const isGuest = (u: AuthUser) => u.email?.endsWith('@guest.watchy') ?? false;
const isTest = (u: AuthUser) => u.email?.endsWith('@watchy.test') ?? false;
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000);
const maskEmail = (email?: string) => {
  if (!email) return '—';
  const [local, domain] = email.split('@');
  return `${local.slice(0, 2)}…@${domain}`;
};
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
  const [premiums, users] = await Promise.all([
    db.select().from(entitlements).where(eq(entitlements.plan, 'premium')),
    listAllUsers(),
  ]);
  const active = premiums.filter((p) => !p.expiresAt || p.expiresAt > now);
  const annual = active.filter((p) => /annual|year/i.test(p.productId ?? '')).length;
  const monthly = active.length - annual;
  const mrr = monthly * PRICE_MONTHLY + (annual * PRICE_ANNUAL) / 12;
  const accounts = users.filter((u) => !isTest(u) && !isGuest(u));
  const conversion = accounts.length ? ((active.length / accounts.length) * 100).toFixed(1) : '0';

  return c.html(
    layout(
      'revenue',
      `${kpis([
        ['Premium actifs', String(active.length), `${monthly} mensuels · ${annual} annuels`],
        ['Conversion', `${conversion}%`, `${active.length} premium / ${accounts.length} comptes`],
        ['MRR estimé', eur(mrr), 'mensuel + annuel/12'],
        ['Revenu annualisé', eur(mrr * 12), 'ARR estimé'],
      ])}
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
  const rows = users
    .filter((u) => !isTest(u))
    .sort((a, b) => (b.created_at > a.created_at ? 1 : -1))
    .slice(0, 50)
    .map((u) => {
      const premium = planBy.get(u.id) === 'premium';
      const plan = premium ? '⭐ premium' : isGuest(u) ? 'invité' : 'free';
      const action = !master
        ? ''
        : premium
          ? `<form method="post" action="/admin/users/premium" style="margin:0"><input type="hidden" name="userId" value="${u.id}"/><input type="hidden" name="action" value="revoke"/><button class="danger">Retirer</button></form>`
          : `<form method="post" action="/admin/users/premium" style="margin:0"><input type="hidden" name="userId" value="${u.id}"/><input type="hidden" name="action" value="grant"/><button>⭐ Premium</button></form>`;
      return `<tr><td>${maskEmail(u.email)}</td><td>${u.created_at.slice(0, 10)}</td><td>${plan}</td>
        <td>${srcBy.get(u.id) ?? '—'}</td><td>${watchBy.get(u.id) ?? 0}</td>
        <td>${costBy.has(u.id) ? usd(costBy.get(u.id)!) : '—'}</td><td>${action}</td></tr>`;
    })
    .join('');

  return c.html(
    layout(
      'users',
      `<section><h2>50 derniers inscrits</h2>
      ${master ? '<p class="muted">« ⭐ Premium » accorde un accès promo (sans paiement, sans expiration) — pour vos testeurs. « Retirer » repasse en gratuit.</p>' : ''}
      <table><tr><th>E-mail</th><th>Inscrit le</th><th>Plan</th><th>Source</th><th>Montres</th><th>Coût IA</th><th></th></tr>${rows}</table></section>`
    )
  );
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
// Envoi exclusivement manuel : campagnes/annonces composées ici — aucun autre
// endroit du code n'appelle sendExpoPush.

const PUSH_SEGMENTS = ['all', 'premium', 'free', 'test'] as const;
type PushSegment = (typeof PUSH_SEGMENTS)[number];
const SEGMENT_LABELS: Record<PushSegment, string> = {
  all: 'Tous',
  premium: 'Premium',
  free: 'Free',
  test: 'Test (e-mail)',
};

const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Utilisateurs premium actifs (même définition que la page Revenus). */
async function premiumUserIds(): Promise<string[]> {
  const rows = await db
    .select({ userId: entitlements.userId })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.plan, 'premium'),
        or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, new Date()))
      )
    );
  return rows.map((r) => r.userId);
}

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

  const [[allCount], premium, campaigns] = await Promise.all([
    db.select({ n: count() }).from(pushTokens),
    premiumUserIds(),
    db.select().from(pushCampaigns).orderBy(desc(pushCampaigns.createdAt)).limit(20),
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
  return c.redirect('/admin/users');
});

// --- Gabarits ----------------------------------------------------------------

function kpis(items: Array<[string, string, string]>): string {
  return `<div class="kpis">${items
    .map(
      ([label, value, hint]) =>
        `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-hint">${hint}</div></div>`
    )
    .join('')}</div>`;
}

const NAV: Array<[string, string, string]> = [
  ['overview', '/admin', "Vue d'ensemble"],
  ['acquisition', '/admin/acquisition', 'Acquisition'],
  ['revenue', '/admin/revenue', 'Revenus'],
  ['costs', '/admin/costs', 'Coûts & ROI'],
  ['users', '/admin/users', 'Utilisateurs'],
  ['push', '/admin/push', 'Notifications'],
  ['team', '/admin/team', 'Équipe'],
];

// Marque du handoff v3 (cadrans empilés) — inline pour éviter tout asset statique.
const MARK = `<svg class="mark" width="23" height="20" viewBox="0 0 72 64" aria-hidden="true"><circle cx="22" cy="32" r="15" fill="#B9C4FF"/><circle cx="36" cy="32" r="16.5" fill="#FFFFFF"/><circle cx="36" cy="32" r="15" fill="#6E7CFF"/><circle cx="50" cy="32" r="16.5" fill="#FFFFFF"/><circle cx="50" cy="32" r="15" fill="#4C6FFF"/><path d="M50 32 L50 23" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round"/><path d="M50 32 L57 34.5" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round"/></svg>`;

function layout(active: string, body: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta http-equiv="refresh" content="300"/>
<title>Watchy — Back office</title><style>${CSS}</style></head><body>
<header><span class="logo">${MARK}watchy <em>admin</em></span>
<nav>${NAV.map(([k, href, label]) => `<a href="${href}" class="${k === active ? 'on' : ''}">${label}</a>`).join('')}</nav></header>
<main>${body}</main>
<footer>Actualisé ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} · rafraîchissement auto 5 min</footer>
</body></html>`;
}

function loginPage(error = ''): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Watchy — Back office</title><style>${CSS}</style></head><body class="login">
<main class="login-card"><span class="logo">${MARK}watchy <em>admin</em></span>
${error ? `<div class="alert">${error}</div>` : ''}
<form method="post" action="/admin/login">
<input type="password" name="token" placeholder="Jeton d'administration" autofocus/>
<button type="submit">Entrer</button></form></main></body></html>`;
}

const CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0;
  background: #F7F8FC; color: #16182B; }
header { display: flex; align-items: center; gap: 24px; padding: 14px 20px;
  background: #16182B; color: #fff; flex-wrap: wrap; }
.logo { font-weight: 500; letter-spacing: -0.2px; font-size: 16px;
  display: inline-flex; align-items: center; gap: 8px; }
.logo em { font-style: normal; color: #B9C4FF; font-weight: 400; letter-spacing: 1px; font-size: 13px; }
nav { display: flex; gap: 4px; flex-wrap: wrap; }
nav a { color: #c5d2e0; text-decoration: none; font-size: 13px; padding: 6px 12px; border-radius: 8px; }
nav a.on, nav a:hover { background: rgba(76,111,255,.30); color: #fff; }
main { max-width: 960px; margin: 0 auto; padding: 20px; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 14px 0; }
.kpi { background: #fff; border-radius: 14px; padding: 14px 16px; box-shadow: 0 2px 10px rgba(22,24,43,.06); }
.kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #7180936; color: #718093; }
.kpi-value { font-size: 26px; font-weight: 700; margin: 4px 0 2px; }
.kpi-hint { font-size: 12px; color: #718093; }
section { background: #fff; border-radius: 14px; padding: 16px 18px; margin: 14px 0;
  box-shadow: 0 2px 10px rgba(22,24,43,.06); }
h2 { font-size: 14px; margin: 0 0 12px; letter-spacing: .3px; }
.chart { width: 100%; height: 110px; background: #f6f8fa; border-radius: 10px; }
.chart-max { font-size: 9px; fill: #718093; }
.bars { display: flex; flex-direction: column; gap: 8px; }
.bar-row { display: grid; grid-template-columns: 160px 1fr 110px; gap: 10px; align-items: center; font-size: 13px; }
.bar-track { background: #f0f3f6; border-radius: 6px; height: 14px; overflow: hidden; display: block; }
.bar-fill { background: #4C6FFF; height: 100%; display: block; border-radius: 6px; }
.bar-value { color: #718093; font-size: 12px; text-align: right; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #718093;
  padding: 6px 8px; border-bottom: 1px solid #e6eaf0; }
td { padding: 7px 8px; border-bottom: 1px solid #f0f3f6; }
.alert { background: #fdf0ef; color: #a4453f; border: 1px solid #f2d6d3; border-radius: 12px;
  padding: 12px 16px; margin: 14px 0; font-size: 14px; }
.muted { color: #718093; font-size: 12px; }
.alert.ok { background: #eef7f0; color: #2f6a45; border-color: #cfe8d6; word-break: break-all; }
.alert.ok code { font-size: 13px; font-weight: 700; }
.inline-form { display: flex; gap: 8px; }
.inline-form input { flex: 1; border: 1px solid #d7dee6; border-radius: 10px; padding: 10px 12px; font-size: 14px; }
.push-form { display: flex; flex-direction: column; gap: 8px; }
.push-form input, .push-form textarea, .push-form select { border: 1px solid #d7dee6;
  border-radius: 10px; padding: 10px 12px; font-size: 14px; font-family: inherit; }
.push-form textarea { resize: vertical; }
.push-form button { align-self: flex-start; padding: 10px 18px; font-size: 14px; }
.push-row { display: flex; gap: 8px; }
.push-row input { flex: 1; }
button { background: #4C6FFF; color: #fff; border: 0; border-radius: 8px; padding: 7px 12px;
  font-size: 12px; cursor: pointer; }
button.danger { background: #a4453f; }
footer { text-align: center; color: #9aa4b0; font-size: 11px; padding: 20px; }
body.login { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
.login-card { background: #fff; border-radius: 18px; padding: 36px 32px; width: 340px; text-align: center;
  box-shadow: 0 4px 24px rgba(22,24,43,.08); display: flex; flex-direction: column; gap: 16px; }
.login-card .logo { color: #16182B; }
.login-card input { border: 1px solid #d7dee6; border-radius: 10px; padding: 12px 14px; font-size: 15px; width: 100%; }
.login-card button { background: #4C6FFF; color: #fff; border: 0; border-radius: 10px; padding: 12px; font-size: 15px; cursor: pointer; width: 100%; }
`;

export { router as adminRouter };
