import { Hono } from 'hono';
import { count, desc, eq, gte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { marketingPosts } from '../db/schema.js';
import {
  CHANNEL_LABELS,
  MARKETING_CHANNELS,
  MARKETING_LOCALES,
  MARKETING_TOPICS,
  generateMarketingPost,
  marketingAvailable,
  type MarketingChannel,
  type MarketingLocale,
  type MarketingTopic,
} from '../lib/marketing.js';
import { daysAgo, esc, isMaster, kpis, layout } from './admin-shared.js';

// Onglet Marketing du back office : file de posts rédigés par Claude, relus
// et édités à la main, puis copiés-collés vers Instagram / X / Reddit.
// Publication 1-clic (API X/Reddit) = extension future : les statuts
// `approved` et la colonne scheduled_for laissent la porte ouverte.
// Monté dans admin.ts APRÈS le middleware d'auth (cookie hérité) ; la page
// est consultable par les jetons d'équipe, toutes les mutations (dont la
// génération, qui coûte ~0,02 $ l'appel) sont réservées au jeton maître.

const router = new Hono();

const STATUSES = ['draft', 'approved', 'published', 'rejected'] as const;
type PostStatus = (typeof STATUSES)[number];
const STATUS_LABELS: Record<PostStatus, string> = {
  draft: 'Brouillons à relire',
  approved: 'Approuvés — à publier',
  published: 'Publiés',
  rejected: 'Rejetés',
};

const isChannel = (v: string): v is MarketingChannel =>
  (MARKETING_CHANNELS as readonly string[]).includes(v);
const isTopic = (v: string): v is MarketingTopic => v in MARKETING_TOPICS;
const isLocale = (v: string): v is MarketingLocale =>
  (MARKETING_LOCALES as readonly string[]).includes(v);

router.get('/', async (c) => {
  const master = isMaster(c);
  const error = c.req.query('error');
  const [posts, [drafts], [approved], [published30]] = await Promise.all([
    db.select().from(marketingPosts).orderBy(desc(marketingPosts.createdAt)).limit(100),
    db.select({ n: count() }).from(marketingPosts).where(eq(marketingPosts.status, 'draft')),
    db.select({ n: count() }).from(marketingPosts).where(eq(marketingPosts.status, 'approved')),
    db
      .select({ n: count() })
      .from(marketingPosts)
      .where(gte(marketingPosts.publishedAt, daysAgo(30))),
  ]);

  const generator = !master
    ? ''
    : marketingAvailable()
      ? `<section><h2>Générer un post</h2>
        <p class="muted">Claude rédige un brouillon (~0,02 $ l'appel, visible dans Coûts &amp; ROI) — rien ne part
        en ligne : vous relisez, éditez puis copiez à la main.</p>
        <form method="post" action="/admin/marketing/generate" class="push-form">
        <div class="push-row">
        <select name="channel">${MARKETING_CHANNELS.map((ch) => `<option value="${ch}">${CHANNEL_LABELS[ch]}</option>`).join('')}</select>
        <select name="topic">${Object.entries(MARKETING_TOPICS).map(([k, label]) => `<option value="${k}">${label}</option>`).join('')}</select>
        <select name="locale"><option value="fr">Français</option><option value="en">English</option></select>
        </div>
        <input name="brief" placeholder="Consigne particulière (facultatif — ex. « mettre en avant le coffre-fort documents »)" maxlength="300"/>
        <button type="submit">Générer un brouillon</button></form></section>`
      : `<section><h2>Générer un post</h2><p class="muted">ANTHROPIC_API_KEY non configurée — la génération est indisponible.</p></section>`;

  const card = (p: typeof marketingPosts.$inferSelect) => {
    const meta = `${CHANNEL_LABELS[p.channel as MarketingChannel] ?? esc(p.channel)} · ${
      MARKETING_TOPICS[p.topic as MarketingTopic] ?? esc(p.topic)
    } · ${p.locale.toUpperCase()} · ${p.createdAt.toISOString().slice(0, 10)}`;
    const copyText = p.title ? `${p.title}\n\n${p.content}` : p.content;
    const copyBtn = `<button type="button" class="ghost" data-copy="${esc(copyText)}"
      onclick="navigator.clipboard.writeText(this.dataset.copy).then(()=>{this.textContent='Copié ✓';setTimeout(()=>this.textContent='Copier',1500)})">Copier</button>`;
    const statusBtn = (status: PostStatus, label: string, cls = '') =>
      `<form method="post" action="/admin/marketing/${p.id}/status" style="margin:0"><input type="hidden" name="status" value="${status}"/><button${cls ? ` class="${cls}"` : ''}>${label}</button></form>`;

    if (p.status === 'draft' && master) {
      return `<div class="post-card"><p class="muted">${meta}</p>
        <form method="post" action="/admin/marketing/${p.id}/update" class="push-form">
        ${p.channel === 'reddit' ? `<input name="title" value="${esc(p.title ?? '')}" placeholder="Titre Reddit" maxlength="300"/>` : ''}
        <textarea name="content" rows="6">${esc(p.content)}</textarea>
        <button type="submit" class="ghost">Enregistrer</button></form>
        <div class="push-row">${statusBtn('approved', 'Approuver')}${copyBtn}${statusBtn('rejected', 'Rejeter', 'danger')}</div></div>`;
    }
    const body = `${p.title ? `<p><strong>${esc(p.title)}</strong></p>` : ''}<p class="post-content">${esc(p.content)}</p>`;
    const actions = !master
      ? ''
      : p.status === 'approved'
        ? `<div class="push-row">${copyBtn}${statusBtn('published', 'Marquer publié')}${statusBtn('draft', 'Repasser en brouillon', 'ghost')}</div>`
        : p.status === 'rejected'
          ? `<div class="push-row">${statusBtn('draft', 'Repasser en brouillon', 'ghost')}<form method="post" action="/admin/marketing/${p.id}/delete" style="margin:0"><button class="danger">Supprimer</button></form></div>`
          : `<div class="push-row">${copyBtn}</div>`;
    return `<div class="post-card"><p class="muted">${meta}${p.publishedAt ? ` · publié le ${p.publishedAt.toISOString().slice(0, 10)}` : ''}</p>${body}${actions}</div>`;
  };

  const sections = STATUSES.map((status) => {
    const list = posts.filter((p) => p.status === status);
    if (!list.length) return '';
    return `<section><h2>${STATUS_LABELS[status]} (${list.length})</h2>${list.map(card).join('')}</section>`;
  }).join('');

  return c.html(
    layout(
      'marketing',
      `${error ? `<div class="alert">${esc(error)}</div>` : ''}
      ${kpis([
        ['Brouillons', String(drafts.n), 'à relire'],
        ['Approuvés', String(approved.n), 'prêts à publier'],
        ['Publiés 30 j', String(published30.n), 'tous canaux'],
      ])}
      ${generator}
      ${sections || '<section><p class="muted">Aucun post pour l\'instant — générez votre premier brouillon.</p></section>'}
      <style>.post-card { border: 1px solid #f0f3f6; border-radius: 12px; padding: 12px 14px; margin: 10px 0; }
      .post-content { white-space: pre-wrap; font-size: 13px; margin: 8px 0; }
      .post-card .push-row { margin-top: 8px; }</style>`,
      { autoRefresh: false } // une édition en cours ne doit pas être perdue par le refresh auto
    )
  );
});

router.post('/generate', async (c) => {
  if (!isMaster(c)) return c.text('Réservé au jeton maître', 403);
  const body = await c.req.parseBody();
  const channel = String(body.channel ?? '');
  const topic = String(body.topic ?? '');
  const locale = String(body.locale ?? 'fr');
  const brief = String(body.brief ?? '').trim().slice(0, 300);
  if (!isChannel(channel) || !isTopic(topic) || !isLocale(locale)) {
    return c.redirect('/admin/marketing?error=Canal, thème ou langue invalide.');
  }

  // Appel bloquant (5-15 s) — acceptable dans le BO
  const post = await generateMarketingPost({ channel, topic, locale, brief: brief || undefined }).catch(
    (err) => {
      console.error('[marketing] génération échouée:', err);
      return null;
    }
  );
  if (!post) {
    return c.redirect('/admin/marketing?error=Génération échouée — réessayez ou vérifiez les logs.');
  }
  await db.insert(marketingPosts).values({
    channel,
    locale,
    topic,
    title: channel === 'reddit' ? post.title : null,
    content: post.content,
  });
  return c.redirect('/admin/marketing');
});

router.post('/:id/update', async (c) => {
  if (!isMaster(c)) return c.text('Réservé au jeton maître', 403);
  const id = c.req.param('id');
  const body = await c.req.parseBody();
  const content = String(body.content ?? '').trim();
  if (!content) return c.redirect('/admin/marketing?error=Le contenu ne peut pas être vide.');
  // Le champ titre n'existe que sur les formulaires Reddit — ne pas écraser sinon
  const title =
    'title' in body ? { title: String(body.title ?? '').trim().slice(0, 300) || null } : {};
  await db
    .update(marketingPosts)
    .set({ content, ...title, updatedAt: new Date() })
    .where(eq(marketingPosts.id, id));
  return c.redirect('/admin/marketing');
});

router.post('/:id/status', async (c) => {
  if (!isMaster(c)) return c.text('Réservé au jeton maître', 403);
  const id = c.req.param('id');
  const body = await c.req.parseBody();
  const status = String(body.status ?? '');
  if (!(STATUSES as readonly string[]).includes(status)) {
    return c.redirect('/admin/marketing?error=Statut invalide.');
  }
  await db
    .update(marketingPosts)
    .set({
      status,
      updatedAt: new Date(),
      ...(status === 'published' ? { publishedAt: new Date() } : {}),
    })
    .where(eq(marketingPosts.id, id));
  return c.redirect('/admin/marketing');
});

router.post('/:id/delete', async (c) => {
  if (!isMaster(c)) return c.text('Réservé au jeton maître', 403);
  await db.delete(marketingPosts).where(eq(marketingPosts.id, c.req.param('id')));
  return c.redirect('/admin/marketing');
});

export { router as adminMarketingRouter };
