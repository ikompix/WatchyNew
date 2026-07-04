-- Cote "full set" (boîte + papiers) en plus de la cote montre seule
ALTER TABLE market_prices ADD COLUMN IF NOT EXISTS full_set_price numeric(12,2);
