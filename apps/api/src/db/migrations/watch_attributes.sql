-- Caractéristiques de la montre : la couleur (et l'année/état) font le prix
-- à référence identique — elles alimentent la cote par variante.
ALTER TABLE watches ADD COLUMN IF NOT EXISTS dial_color text;
ALTER TABLE watches ADD COLUMN IF NOT EXISTS production_year integer;
ALTER TABLE watches ADD COLUMN IF NOT EXISTS condition text;

-- Cote par variante : lignes rattachées à une montre précise (attributs
-- différenciants) — les lignes sans watch_id restent la cote de base du modèle.
ALTER TABLE market_prices ADD COLUMN IF NOT EXISTS watch_id uuid REFERENCES watches(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS market_prices_watch_id_idx ON market_prices (watch_id) WHERE watch_id IS NOT NULL;
