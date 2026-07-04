import { randomBytes, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { supabaseAdmin } from '../lib/supabase.js';
import type { ApiResponse } from '@watchy/types';

const router = new Hono();

/**
 * « Continuer sans compte » : crée un compte invité côté serveur et renvoie
 * ses identifiants — le client fait un signInWithPassword classique (session
 * et RLS identiques à un compte normal, upgrade possible plus tard).
 */
router.post('/guest', async (c) => {
  const email = `guest-${randomUUID()}@guest.watchy`;
  const password = randomBytes(24).toString('base64url');

  const { error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { guest: true },
  });

  if (error) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: 'GUEST_CREATE_FAILED', message: error.message } },
      500
    );
  }

  return c.json<ApiResponse<{ email: string; password: string }>>(
    { data: { email, password }, error: null },
    201
  );
});

export { router as authRouter };
