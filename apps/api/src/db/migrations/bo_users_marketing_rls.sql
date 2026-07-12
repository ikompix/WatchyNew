-- BO utilisateurs + marketing — RLS des nouvelles tables (hors Drizzle, appliquer
-- via : npx tsx --env-file=.env scripts/apply-sql.mts src/db/migrations/bo_users_marketing_rls.sql)

-- Tables serveur uniquement (BO / middleware) : RLS activé sans policy = deny
-- pour les clients Supabase ; seule la connexion service de l'API y accède
ALTER TABLE banned_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_posts ENABLE ROW LEVEL SECURITY;
