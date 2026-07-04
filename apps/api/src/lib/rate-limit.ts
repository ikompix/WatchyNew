import type { Context, Next } from 'hono';

/**
 * Rate limiting in-memory à fenêtre glissante, par IP — suffisant pour une
 * API single-instance en beta. Derrière un proxy (Fly, Railway…), l'IP réelle
 * arrive dans x-forwarded-for.
 */
function clientIp(c: Context): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  );
}

export function rateLimit(options: { windowMs: number; max: number; scope: string }) {
  const hits = new Map<string, number[]>();

  // Purge périodique pour ne pas croître indéfiniment
  setInterval(() => {
    const cutoff = Date.now() - options.windowMs;
    for (const [key, times] of hits) {
      const fresh = times.filter((t) => t > cutoff);
      if (fresh.length === 0) hits.delete(key);
      else hits.set(key, fresh);
    }
  }, options.windowMs).unref?.();

  return async (c: Context, next: Next) => {
    const key = clientIp(c);
    const cutoff = Date.now() - options.windowMs;
    const fresh = (hits.get(key) ?? []).filter((t) => t > cutoff);

    if (fresh.length >= options.max) {
      console.warn(`[rate-limit] ${options.scope}: ${key} bloqué (${fresh.length} req)`);
      return c.json(
        { data: null, error: { code: 'RATE_LIMITED', message: 'Trop de requêtes — réessayez plus tard.' } },
        429
      );
    }

    fresh.push(Date.now());
    hits.set(key, fresh);
    await next();
  };
}
