import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { rateLimit } from './lib/rate-limit.js';
import { watchesRouter } from './routes/watches.js';
import { watchModelsRouter } from './routes/watch-models.js';
import { marketPricesRouter } from './routes/market-prices.js';
import { recognitionRouter } from './routes/recognition.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { wishlistRouter } from './routes/wishlist.js';
import { portfolioRouter } from './routes/portfolio.js';
import { webhooksRouter } from './routes/webhooks.js';
import { legalRouter } from './routes/legal.js';
import { pagesRouter } from './routes/pages.js';
import { adminRouter } from './routes/admin.js';

const app = new Hono();

// Les erreurs non gérées doivent être visibles dans les logs du provider
// (sinon Railway n'affiche qu'un « Internal Server Error » muet)
app.onError((err, c) => {
  console.error(`[api] ${c.req.method} ${c.req.path}:`, err);
  return c.json(
    { data: null, error: { code: 'INTERNAL', message: 'Erreur interne — réessayez.' } },
    500
  );
});

// L'app mobile native n'est pas soumise au CORS — n'ouvrir qu'aux origines
// web explicitement autorisées (vide par défaut)
const corsOrigins = (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean);
app.use('*', cors({ origin: corsOrigins }));

// Garde-fou global (single instance, in-memory)
app.use('*', rateLimit({ windowMs: 60_000, max: 300, scope: 'global' }));
// La création de comptes invités est publique : protection stricte anti-spam
app.use('/auth/guest', rateLimit({ windowMs: 3_600_000, max: 5, scope: 'auth/guest' }));

app.get('/health', (c) => c.json({ status: 'ok' }));

app.route('/watches', watchesRouter);
app.route('/watch-models', watchModelsRouter);
app.route('/market-prices', marketPricesRouter);
app.route('/recognition', recognitionRouter);
app.route('/me', meRouter);
app.route('/wishlist', wishlistRouter);
app.route('/portfolio', portfolioRouter);
// Pas d'authMiddleware : c'est le point d'entrée des invités
app.route('/auth', authRouter);
// Pas d'authMiddleware : RevenueCat s'authentifie par secret partagé
app.route('/webhooks', webhooksRouter);
// Pages légales publiques (exigence App Store Connect)
app.route('/legal', legalRouter);
// Back office (jeton ADMIN_TOKEN, cookie httpOnly)
app.route('/admin', adminRouter);
// Pages d'atterrissage auth (site_url Supabase → /confirmed)
app.route('/', pagesRouter);

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, () => {
  console.log(`API running on http://localhost:${port}`);
});

