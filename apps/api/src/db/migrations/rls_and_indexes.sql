-- Trigger updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER watches_updated_at
  BEFORE UPDATE ON watches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER watch_models_updated_at
  BEFORE UPDATE ON watch_models
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS watches
ALTER TABLE watches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "watches_select_own" ON watches FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "watches_insert_own" ON watches FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "watches_update_own" ON watches FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "watches_delete_own" ON watches FOR DELETE USING (auth.uid() = user_id);

-- RLS catalogue
ALTER TABLE watch_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "watch_models_public_read" ON watch_models FOR SELECT USING (true);

ALTER TABLE market_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "market_prices_public_read" ON market_prices FOR SELECT USING (true);

-- Index
CREATE INDEX watches_user_id_idx ON watches (user_id);
CREATE INDEX watches_watch_model_id_idx ON watches (watch_model_id);
CREATE INDEX market_prices_model_fetched_idx ON market_prices (watch_model_id, fetched_at DESC);
