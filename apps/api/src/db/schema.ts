import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const watchModels = pgTable('watch_models', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  brand: text('brand').notNull(),
  model: text('model').notNull(),
  reference: text('reference'),
  canonicalName: text('canonical_name').notNull(),
  photoUrl: text('photo_url'),
  // Surnom de collectionneurs (« Batman », « Hulk »…) — identifie une référence
  // précise, nourrit la recherche et la recherche de cote
  nickname: text('nickname'),
  // Dernier passage d'enrichissement IA (photo + surnom) — même en échec :
  // c'est le cache négatif qui évite de rejouer des recherches web coûteuses
  enrichedAt: timestamp('enriched_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// userId references auth.users implicitly — enforced by RLS, not FK (cross-schema)
export const watches = pgTable('watches', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull(),
  watchModelId: uuid('watch_model_id').references(() => watchModels.id, {
    onDelete: 'set null',
  }),
  brand: text('brand').notNull(),
  model: text('model').notNull(),
  reference: text('reference'),
  photoUrl: text('photo_url'),
  // La couleur du cadran (et année/état) différencient le prix à référence égale
  dialColor: text('dial_color'),
  productionYear: integer('production_year'),
  condition: text('condition'),
  purchasePrice: numeric('purchase_price', { precision: 12, scale: 2 }),
  purchaseDate: date('purchase_date'),
  hasPapers: boolean('has_papers').notNull().default(false),
  hasBox: boolean('has_box').notNull().default(false),
  notes: text('notes'),
  completionPct: integer('completion_pct').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const marketPrices = pgTable('market_prices', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  watchModelId: uuid('watch_model_id')
    .notNull()
    .references(() => watchModels.id, { onDelete: 'cascade' }),
  // Non nul = cote de la variante précise (couleur/année/état de cette montre)
  watchId: uuid('watch_id').references(() => watches.id, { onDelete: 'cascade' }),
  price: numeric('price', { precision: 12, scale: 2 }).notNull(),
  // Cote "full set" (boîte + papiers) — null si non relevée
  fullSetPrice: numeric('full_set_price', { precision: 12, scale: 2 }),
  currency: text('currency').notNull().default('USD'),
  source: text('source'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
});

// Plan payant par utilisateur — absence de ligne = free (userId = auth.users, pas de FK cross-schema)
export const entitlements = pgTable('entitlements', {
  userId: uuid('user_id').primaryKey(),
  plan: text('plan').notNull().default('free'), // 'free' | 'premium'
  source: text('source'), // 'revenuecat' | 'promo'
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  rcAppUserId: text('rc_app_user_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Une ligne par reconnaissance photo réellement lancée — base du quota mensuel free
export const recognitionEvents = pgTable('recognition_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Cache du rapport d'expert IA — invalidé quand la montre est modifiée après createdAt
export const expertReports = pgTable('expert_reports', {
  watchId: uuid('watch_id')
    .primaryKey()
    .references(() => watches.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  model: text('model').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Wishlist : toujours liée à un modèle du catalogue (la saisie libre crée le
// modèle — croissance organique, comme la reconnaissance). targetPrice non nul
// = alerte de prix active (premium).
export const wishlistItems = pgTable(
  'wishlist_items',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull(),
    watchModelId: uuid('watch_model_id')
      .notNull()
      .references(() => watchModels.id, { onDelete: 'cascade' }),
    targetPrice: numeric('target_price', { precision: 12, scale: 2 }),
    // Dernière notification envoyée — évite de re-notifier la même cote
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('wishlist_user_model_unique').on(t.userId, t.watchModelId)]
);

// « Me prévenir » sur les features à venir (teaser communauté…) — mesure de
// la demande avant d'investir dans une feature
export const featureInterest = pgTable(
  'feature_interest',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull(),
    feature: text('feature').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('feature_interest_user_feature_unique').on(t.userId, t.feature)]
);

// Jetons Expo Push — un utilisateur peut avoir plusieurs appareils
export const pushTokens = pgTable('push_tokens', {
  token: text('token').primaryKey(),
  userId: uuid('user_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WatchModelInsert = typeof watchModels.$inferInsert;
export type WatchModelSelect = typeof watchModels.$inferSelect;
export type WatchInsert = typeof watches.$inferInsert;
export type WatchSelect = typeof watches.$inferSelect;
export type MarketPriceInsert = typeof marketPrices.$inferInsert;
export type MarketPriceSelect = typeof marketPrices.$inferSelect;
export type EntitlementSelect = typeof entitlements.$inferSelect;
export type ExpertReportSelect = typeof expertReports.$inferSelect;
