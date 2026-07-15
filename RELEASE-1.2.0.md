# Release 1.2.0 — checklist et actions manuelles

Périmètre : coffre-fort documents (premium), alertes de cote push (premium),
packs **+1 emplacement collection** et **+1 emplacement wishlist** (1,99 €
chacun). **Pivot du 2026-07-14** : quotas séparés 3 collection + 3 wishlist en
free (fini le combiné), suppression des crédits de scan (`watchy_scans_5` et
`watchy_slots_3` supprimés d'ASC) — la reconnaissance est gated par les slots
du pool visé + plafond anti-abus 30 scans/jour. Migration 0018 (rename
`extra_slots` → `extra_watch_slots`, + `extra_wishlist_slots`, drop
`scan_credits`), appliquée automatiquement au démarrage du conteneur.

Smoke tests : `premium-test.mts`, `wishlist-test.mts`, `slot-packs-test.mts`
(API lancée — tous verts le 2026-07-14).

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

1. Products : **supprimer** `watchy_scans_5` et `watchy_slots_3`, créer
   `watchy_watch_slot_1` et `watchy_wishlist_slot_1` (app iOS). **Aucun
   entitlement attaché** (consommables — le webhook crédite, jamais
   `entitlements.plan`).
2. Vérifier au premier achat (Test Store puis sandbox) le **type d'event réel**
   reçu par le webhook : le code attend `NON_RENEWING_PURCHASE` (achat) et
   `CANCELLATION` (refund) ; tout type inattendu pour un produit consommable est
   loggé `[revenuecat] event … inattendu` dans les logs Railway — ajuster la
   branche si besoin.

## 4. App Store Connect

1. ✅ **Fait via l'API ASC (2026-07-14, clé AHMP9LAZBJ)** — les anciens
   consommables sont supprimés, les 2 nouveaux créés avec localisations FR/EN,
   prix 1,99 € (base FRA) et disponibilité mondiale (175 territoires + futurs) :
   - `watchy_watch_slot_1` (id 6790858576) — FR « +1 emplacement collection » / EN « +1 collection slot »
   - `watchy_wishlist_slot_1` (id 6790858548) — FR « +1 emplacement wishlist » / EN « +1 wishlist slot »
   **Reste (état MISSING_METADATA)** : uploader le **screenshot de review** de
   chaque produit (vraie capture de l'app montrant l'achat — ex. l'alerte
   3 boutons), puis joindre les 2 produits à la soumission de la version 1.2.0.
2. Lier les 2 produits dans RevenueCat (App Store app config).
3. App Privacy : la catégorie « Photos » couvre déjà les documents (contenu
   utilisateur lié à l'identité) — vérifier qu'aucune nouvelle déclaration
   n'est requise.
4. ✅ Version 1.2.0 créée via l'API ASC (2026-07-15, id `840053e4`) avec la note
   FR (seule locale de la fiche) — texte corrigé post-pivot (plus de « packs de
   scans ») :
   > Watchy Premium s'enrichit : coffre-fort papiers & factures sur chaque montre, et alertes quand la cote de vos montres bouge. Nouveau : packs d'emplacements supplémentaires (collection et wishlist) sans abonnement.

## 5. Paywall / abonnement (rien à faire)

Les 2 features premium (coffre-fort, alertes) sont ajoutées au paywall in-app
(`paywall.features.vault` / `.alerts`) — livrées AVANT d'être vendues,
conformément à la règle « roadmap non vendue tant que non livrée ».

## 6. Tests manuels sur dev build (`npx expo run:ios`)

- [ ] Achat `watchy_watch_slot_1` (Test Store) → webhook (tunnel ngrok en
      local) → la 4ᵉ montre passe, la carte verrouillée se déverrouille
      d'elle-même.
- [ ] Achat `watchy_wishlist_slot_1` → le 4ᵉ item wishlist passe ; vérifier que
      la limite collection ne bouge pas (pools indépendants).
- [ ] Collection pleine → bouton photo bloqué AVANT la caméra (alerte « Pas
      d'emplacement disponible » avec +1 slot) ; idem scan wishlist.
- [ ] Alerte de cote : compte premium + montre avec cote, forcer un refresh avec
      variation ≥ 5 % → push reçu dans la langue de l'appareil, tap → fiche.
- [ ] Toggle « Alertes de cote » dans le profil (opt-out → plus d'alerte).
- [ ] Upload / suppression de document sur une fiche montre ; compte free →
      carte verrouillée → paywall.
- [ ] Remboursement sandbox d'un pack → slot repris (`GREATEST(x-n, 0)`), la
      montre la plus récente se re-verrouille.

## 7. Back office

- /admin/revenue : KPI « Packs vendus 30 j » + « Revenu packs 30 j » + tableau
  consommables.
- /admin/push : KPI « Alertes de cote 30 j » (envois automatiques premium).

## 8. Rejet 3.1.1 du 2026-07-15 et resoumission

Les 2 IAP soumis seuls ont été rejetés (Guideline 3.1.1 : les consommables
changent le business model → Apple doit vérifier l'achat dans un binaire).
Correctif : soumettre la version 1.2.0 + build + IAP **ensemble**, ce qui a
imposé de déployer toute la 1.2 en prod AVANT validation Apple (le binaire
parle à l'API prod ; l'achat doit être fonctionnel pendant la review).

Fait le 2026-07-15 :
- 1.2 déployée en prod : commit `8ad87af` poussé, migrations 0013→0018 passées
  au démarrage Railway, `release_1_2.sql` et bucket `watch-documents` déjà en
  place depuis le 2026-07-12. Vérifié sur prod : `/me` renvoie les nouveaux
  champs, 4ᵉ montre/wishlist → 403 QUOTA_EXCEEDED.
- Compte review dédié packs (le démo est premium, il ne voit pas l'alerte) :
  **review-packs@watchy-app.com / WatchyPacks2026!** — free, 3 montres +
  3 wishlist (recréable : pattern dans l'historique, dérivé de demo-seed.mts).
- Build 11 (1.2.0) EAS terminé ; la soumission EAS restait coincée en file
  (`IN_QUEUE` 35 min) → annulée, .ipa téléchargé et uploadé direct via
  `xcrun altool` + clé ASC (la clé est aussi dans
  `~/.appstoreconnect/private_keys/`).
- Version 1.2.0 + build 11 **soumis — WAITING_FOR_REVIEW** (review submission
  `f433a929`), notes de review EN avec le flux d'achat et les 2 comptes.
- IAP resoumis via `inAppPurchaseSubmissions` (201, endpoint en écriture
  seule) + notes de review par produit mises à jour. ⚠️ L'état API restait
  `DEVELOPER_ACTION_NEEDED` après la soumission — vérifier dans l'UI ASC que
  les 2 produits sont bien « En attente de vérification », sinon les soumettre
  depuis la fiche produit ou la section IAP de la page de version.

## 9. Reste à faire (hors release, hérité de 1.1.0)

- Médiateur de la consommation + téléphone pro → `packages/types/src/legal/*.ts`.
- Rotation des secrets prod ; suppression des services Railway en doublon ;
  limite de dépense mensuelle console.anthropic.com.
- Envisager `db:migrate` au démarrage du service Railway.
