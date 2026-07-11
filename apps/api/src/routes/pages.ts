import { Hono } from 'hono';

// Pages publiques de redirection auth (cibles du site_url Supabase).
// /confirmed : atterrissage après clic sur un e-mail de confirmation.
const router = new Hono();

router.get('/confirmed', (c) => {
  return c.html(`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Adresse confirmée — Watchy</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #16182B;
         background: #F7F8FC; margin: 0; min-height: 100vh; display: flex;
         align-items: center; justify-content: center; padding: 24px; }
  main { max-width: 420px; background: #ffffff; border-radius: 20px; padding: 40px 32px;
         text-align: center; box-shadow: 0 4px 24px rgba(22,24,43,0.08); }
  .badge { width: 64px; height: 64px; border-radius: 32px; background: rgba(64,128,90,0.12);
           display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;
           font-size: 30px; }
  h1 { font-size: 22px; margin: 0 0 10px; }
  p { font-size: 15px; color: #3c4654; line-height: 1.55; margin: 0 0 24px; }
  a.open { display: inline-block; background: #4C6FFF; color: #ffffff; text-decoration: none;
           padding: 14px 30px; border-radius: 14px; font-size: 15px; }
  .brand { margin-top: 24px; font-size: 12px; letter-spacing: 0.5px; color: #9aa4b0;
           display: flex; align-items: center; justify-content: center; gap: 6px; }
  .error h1 { color: #a4453f; }
</style>
</head>
<body>
<main>
  <div id="ok">
    <div class="badge">✓</div>
    <h1>Adresse confirmée</h1>
    <p>Votre compte Watchy est actif. Retournez dans l'application pour vous connecter et commencer votre collection.</p>
    <a class="open" href="watchy://">Ouvrir Watchy</a>
  </div>
  <div id="err" class="error" style="display:none">
    <div class="badge">✕</div>
    <h1>Lien expiré ou invalide</h1>
    <p id="errmsg">Relancez l'inscription depuis l'application pour recevoir un nouveau lien.</p>
  </div>
  <p class="brand"><svg width="21" height="18" viewBox="0 0 72 64" aria-hidden="true"><circle cx="22" cy="32" r="15" fill="#B9C4FF"/><circle cx="36" cy="32" r="16.5" fill="#FFFFFF"/><circle cx="36" cy="32" r="15" fill="#6E7CFF"/><circle cx="50" cy="32" r="16.5" fill="#FFFFFF"/><circle cx="50" cy="32" r="15" fill="#4C6FFF"/><path d="M50 32 L50 23" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round"/><path d="M50 32 L57 34.5" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round"/></svg>watchy · watchy-app.com</p>
</main>
<script>
  // Supabase renvoie les erreurs (lien expiré…) dans le fragment ou la query
  var params = new URLSearchParams(location.hash.replace(/^#/, '') || location.search);
  var desc = params.get('error_description');
  if (desc) {
    document.getElementById('ok').style.display = 'none';
    document.getElementById('err').style.display = 'block';
    document.getElementById('errmsg').textContent = decodeURIComponent(desc.replace(/\\+/g, ' '));
  }
</script>
</body>
</html>`);
});

export { router as pagesRouter };
