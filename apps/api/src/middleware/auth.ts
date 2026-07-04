import type { Context, Next } from 'hono';
import { supabaseAdmin } from '../lib/supabase.js';

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Missing token' } }, 401);
  }

  const token = authHeader.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return c.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, 401);
  }

  c.set('userId', data.user.id);
  await next();
}
