# Release 1.2.0 — checklist et actions manuelles

Périmètre : coffre-fort documents (premium), alertes de cote push (premium),
pack de 5 scans (1,99 €), pack +3 emplacements (2,99 €). **Aucun appel IA
nouveau** — les alertes se greffent sur les refreshs de cote déjà déclenchés
(vérifié : table `ai_usage` vierge après le smoke test complet).

Smoke test : `npx tsx --env-file=.env scripts/release-1-2-test.mts` (API lancée,
24 checks ✓ le 2026-07-12).

## 1. Base de données (prod, avant déploiement)

1. `pnpm --filter api db:migrate` (migrations 0013 → 0016 : watch_documents,
   push_tokens.locale + notification_prefs + price_alerts, consumable_purchases +
   scan_credits, entitlements.extra_slots). ⚠️ Leçon 1.1.0 : ne pas oublier —
   l'oubli de la 0011 avait cassé l'ajout de montre 4 jours.
2. RLS/index manuels : `npx tsx --env-file=.env scripts/apply-sql.mts src/db/migrations/release_1_2.sql`

## 2. Supabase (prod)

- Storage → New bucket : **`watch-documents`**, `public: false` (PRIVÉ —
  documents sensibles, accès par URL signée uniquement). Fait en local le
  2026-07-12, à refaire sur le projet prod `ahjbfjrauwarxlvzwcnq`.

## 3. RevenueCat

1. Products → New : `watchy_scans_5` et `watchy_slots_3` (app iOS).
   **Aucun entitlement attaché** (consommables — le webhook crédite, jamais
   `entitlements.plan`).
2. Vérifier au premier achat (Test Store puis sandbox) le **type d'event réel**
   reçu par le webhook : le code attend `NON_RENEWING_PURCHASE` (achat) et
   `CANCELLATION` (refund) ; tout type inattendu pour un produit consommable est
   loggé `[revenuecat] event … inattendu` dans les logs Railway — ajuster la
   branche si besoin.

## 4. App Store Connect

1. ✅ **Fait via l'API ASC (2026-07-12, clé AHMP9LAZBJ)** — les 2 consommables
   sont créés avec localisations FR/EN, prix (base FRA) et disponibilité
   mondiale (175 territoires + futurs) :
   - `watchy_scans_5` (id 6790026881) — 1,99 € · FR « 5 reconnaissances photo » / EN « 5 photo scans »
   - `watchy_slots_3` (id 6790026813) — 2,99 € · FR « +3 emplacements » / EN « +3 collection slots »
   **Reste (état MISSING_METADATA)** : uploader le **screenshot de review** de
   chaque produit (vraie capture de l'app montrant l'achat — ex. l'alerte
   3 boutons, `xcrun simctl io booted screenshot`), puis joindre les 2 produits
   à la soumission de la version 1.2.0.
2. Lier les 2 produits dans RevenueCat (App Store app config).
3. App Privacy : la catégorie « Photos » couvre déjà les documents (contenu
   utilisateur lié à l'identité) — vérifier qu'aucune nouvelle déclaration
   n'est requise.
4. Version 1.2.0 → notes de version :
   - **FR** :
     > Watchy Premium s'enrichit : coffre-fort papiers & factures sur chaque montre, et alertes quand la cote de vos montres bouge. Nouveau : packs de scans et d'emplacements supplémentaires sans abonnement.
   - **EN** :
     > Watchy Premium grows: a papers & receipts vault on every watch, plus alerts when your watches move in value. New: scan packs and extra slots without a subscription.

## 5. Paywall / abonnement (rien à faire)

Les 2 features premium (coffre-fort, alertes) sont ajoutées au paywall in-app
(`paywall.features.vault` / `.alerts`) — livrées AVANT d'être vendues,
conformément à la règle « roadmap non vendue tant que non livrée ».

## 6. Tests manuels sur dev build (`npx expo run:ios`)

- [ ] Achat `watchy_scans_5` (Test Store) → webhook (tunnel ngrok en local) →
      `/me.scanCredits = 5` visible, 6ᵉ scan passe.
- [ ] Achat `watchy_slots_3` → 6ᵉ montre passe, les éléments verrouillés se
      déverrouillent d'eux-mêmes.
- [ ] Alerte de cote : compte premium + montre avec cote, forcer un refresh avec
      variation ≥ 5 % → push reçu dans la langue de l'appareil, tap → fiche.
- [ ] Toggle « Alertes de cote » dans le profil (opt-out → plus d'alerte).
- [ ] Upload / suppression de document sur une fiche montre ; compte free →
      carte verrouillée → paywall.
- [ ] Remboursement sandbox d'un pack → crédits repris (`GREATEST(x-n, 0)`).

## 7. Back office

- /admin/revenue : KPI « Packs vendus 30 j » + « Revenu packs 30 j » + tableau
  consommables.
- /admin/push : KPI « Alertes de cote 30 j » (envois automatiques premium).

## 8. Reste à faire (hors release, hérité de 1.1.0)

- Médiateur de la consommation + téléphone pro → `packages/types/src/legal/*.ts`.
- Rotation des secrets prod ; suppression des services Railway en doublon ;
  limite de dépense mensuelle console.anthropic.com.
- Envisager `db:migrate` au démarrage du service Railway.
