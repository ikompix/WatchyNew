-- Release 1.2 — RLS et index des nouvelles tables (hors Drizzle, appliquer
-- via : npx tsx --env-file=.env scripts/apply-sql.mts src/db/migrations/release_1_2.sql)

-- Coffre-fort documents : accès uniquement à ses propres lignes
ALTER TABLE watch_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "watch_documents_select_own" ON watch_documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "watch_documents_insert_own" ON watch_documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "watch_documents_delete_own" ON watch_documents FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX watch_documents_watch_id_idx ON watch_documents (watch_id);
CREATE INDEX watch_documents_user_id_idx ON watch_documents (user_id);

-- Alertes de cote : tables serveur uniquement (RLS activé sans policy = deny)
ALTER TABLE notification_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;
CREATE INDEX price_alerts_model_created_idx ON price_alerts (watch_model_id, created_at DESC);
