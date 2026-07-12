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
  // précise ; seedé en dur (catalog:nicknames) et détecté par la reco photo
  nickname: text('nickname'),
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
  // Surnom de collectionneurs dénormalisé (comme brand/model/reference) — la
  // montre garde son identité même si le modèle catalogue disparaît
  nickname: text('nickname'),
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
  // Produit RevenueCat (watchy_premium_monthly / _annual) — distingue le MRR
  productId: text('product_id'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  rcAppUserId: text('rc_app_user_id'),
  // Emplacements achetés à l'unité (pack watchy_slots_3) — permanents : ils
  // survivent à l'expiration d'un abonnement, indépendants de `plan`
  extraSlots: integer('extra_slots').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Chaque appel IA persiste son coût (source du dashboard /admin/costs) —
// les logs Railway s'évaporent, la DB non
export const aiUsage = pgTable('ai_usage', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  label: text('label').notNull(),
  model: text('model').notNull(),
  costUsd: numeric('cost_usd', { precision: 10, scale: 4 }).notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
  searches: integer('searches').notNull().default(0),
  userId: uuid('user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Jetons d'accès au back office pour l'équipe — stockés hachés (sha256),
// révocables individuellement ; le ADMIN_TOKEN d'env reste le jeton maître
export const adminTokens = pgTable('admin_tokens', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  label: text('label').notNull(),
  tokenHash: text('token_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

// Réponse à « Comment nous avez-vous connu ? » (onboarding, facultatif)
export const acquisitionSources = pgTable('acquisition_sources', {
  userId: uuid('user_id').primaryKey(),
  source: text('source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Profil déclaratif FACULTATIF — minimisation volontaire (RGPD) : tranche
// d'âge (pas de date de naissance), ville/pays (pas d'adresse postale)
export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey(),
  ageRange: text('age_range'), // '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65+'
  city: text('city'),
  country: text('country'),
  expertise: text('expertise'), // 'novice' | 'passionne' | 'collectionneur' | 'metier'
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Une ligne par reconnaissance photo réellement lancée — base du quota mensuel free
export const recognitionEvents = pgTable('recognition_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Wishlist : toujours liée à un modèle du catalogue (la saisie libre crée le
// modèle — croissance organique, comme la reconnaissance). photoUrl = photo
// facultative uploadée par l'utilisateur (visuel de l'item).
export const wishlistItems = pgTable(
  'wishlist_items',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull(),
    watchModelId: uuid('watch_model_id')
      .notNull()
      .references(() => watchModels.id, { onDelete: 'cascade' }),
    photoUrl: text('photo_url'),
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
  // Langue de l'appareil ('fr' | 'en') — les push automatiques (alertes de
  // cote) n'ont pas de contexte requête pour lire Accept-Language
  locale: text('locale').notNull().default('fr'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Achats consommables RevenueCat (packs de scans, emplacements) — une ligne
// par event RC, rc_event_id unique = idempotence (RC retente les webhooks)
export const consumablePurchases = pgTable('consumable_purchases', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  rcEventId: text('rc_event_id').notNull().unique(),
  userId: uuid('user_id').notNull(),
  productId: text('product_id').notNull(),
  // Négatif = remboursement
  quantity: integer('quantity').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Ledger de crédits de scans : +N à l'achat d'un pack, -1 par scan consommé,
// -N au remboursement. Solde = sum(delta).
export const scanCredits = pgTable('scan_credits', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull(),
  delta: integer('delta').notNull(),
  reason: text('reason').notNull(), // 'purchase' | 'scan' | 'refund'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Préférences de notifications — absence de ligne = tout activé par défaut
export const notificationPrefs = pgTable('notification_prefs', {
  userId: uuid('user_id').primaryKey(),
  priceAlerts: boolean('price_alerts').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Trace des alertes de cote envoyées (premium) — sert aussi d'anti-doublon :
// pas de nouvelle alerte pour un modèle/variante alerté il y a moins de 7 j
export const priceAlerts = pgTable('price_alerts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  watchModelId: uuid('watch_model_id').notNull(),
  // Non nul = alerte de variante (un seul destinataire, le propriétaire)
  watchId: uuid('watch_id'),
  oldPrice: numeric('old_price', { precision: 12, scale: 2 }).notNull(),
  newPrice: numeric('new_price', { precision: 12, scale: 2 }).notNull(),
  recipients: integer('recipients').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Coffre-fort documents (premium) : papiers/factures/certificats attachés à
// une montre. `path` = chemin dans le bucket PRIVÉ watch-documents — jamais
// d'URL persistée, les URLs signées expirent et sont générées à la lecture.
export const watchDocuments = pgTable('watch_documents', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull(),
  watchId: uuid('watch_id')
    .notNull()
    .references(() => watches.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  label: text('label'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Campagnes push envoyées depuis le back office — l'envoi est exclusivement
// manuel (POST /admin/push, jeton maître) : rien dans le code ne pousse seul
export const pushCampaigns = pgTable('push_campaigns', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  title: text('title').notNull(),
  body: text('body').notNull(),
  segment: text('segment').notNull(), // 'all' | 'premium' | 'free' | 'test'
  recipients: integer('recipients').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WatchModelInsert = typeof watchModels.$inferInsert;
export type WatchModelSelect = typeof watchModels.$inferSelect;
export type WatchInsert = typeof watches.$inferInsert;
export type WatchSelect = typeof watches.$inferSelect;
export type MarketPriceInsert = typeof marketPrices.$inferInsert;
export type MarketPriceSelect = typeof marketPrices.$inferSelect;
export type EntitlementSelect = typeof entitlements.$inferSelect;
