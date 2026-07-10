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
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1b2531;
         background: #eef1f5; margin: 0; min-height: 100vh; display: flex;
         align-items: center; justify-content: center; padding: 24px; }
  main { max-width: 420px; background: #ffffff; border-radius: 20px; padding: 40px 32px;
         text-align: center; box-shadow: 0 4px 24px rgba(27,37,49,0.08); }
  .badge { width: 64px; height: 64px; border-radius: 32px; background: rgba(64,128,90,0.12);
           display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;
           font-size: 30px; }
  h1 { font-size: 22px; margin: 0 0 10px; }
  p { font-size: 15px; color: #3c4654; line-height: 1.55; margin: 0 0 24px; }
  a.open { display: inline-block; background: #5b7fa6; color: #ffffff; text-decoration: none;
           padding: 14px 30px; border-radius: 14px; font-size: 15px; }
  .brand { margin-top: 24px; font-size: 11px; letter-spacing: 3px; color: #9aa4b0; }
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
  <p class="brand">WATCHY · watchy-app.com</p>
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
