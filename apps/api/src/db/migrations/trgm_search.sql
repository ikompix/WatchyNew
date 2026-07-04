-- Recherche tolérante aux fautes sur le catalogue (ex. "Oyester" → "Oyster Perpetual")
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS watch_models_canonical_name_trgm_idx
  ON watch_models USING gin (canonical_name gin_trgm_ops);
