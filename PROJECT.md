# Watchy — brief produit
 
## Contexte
 
Watchy est une application mobile (iOS/Android) de suivi de collection de montres.
 
Un prototype fonctionnel avait déjà été développé et déployé sur TestFlight, mais le projet a été abandonné. Ce prototype était "full vibe-codé" avec les IA de l'époque, donc pas propre techniquement. **Décision : on repart de zéro**, aucun code ni asset du prototype n'est réutilisé.
 
## Cible
 
Priorité aux **collectionneurs sérieux** (suivi patrimonial précis : prix d'achat, papiers, boîte, export). Mais l'app doit aussi pouvoir convertir le **grand public passionné**, qui veut surtout visualiser sa collection et regarder sa valeur évoluer sans saisie fastidieuse.
 
Conséquence produit : la saisie détaillée doit être **optionnelle et progressive**, jamais bloquante à l'ajout d'une montre. On peut afficher un % de complétion de fiche pour inciter à la compléter, sans l'imposer.
 
## Fonctionnement du cœur produit
 
1. L'utilisateur prend une photo de sa montre.
2. Une IA de reconnaissance identifie le modèle et remplit automatiquement les infos (marque, modèle, référence).
3. Si l'IA ne reconnaît pas la montre : fallback de recherche/saisie manuelle dans la base de modèles.
4. L'utilisateur complète manuellement (à son rythme) : date d'achat, prix d'achat, présence des papiers, présence de la boîte.
5. L'app recherche la cote de marché actuelle du modèle et suit son évolution dans le temps.
## Scope produit
 
### P0 — MVP (à construire maintenant)
- Onboarding minimal, pas de friction avant le premier ajout de montre
- Capture photo → reconnaissance IA → fiche auto-remplie
- Fallback de recherche manuelle si l'IA ne reconnaît pas
- Fiche montre avec champs optionnels progressifs (achat, papiers, boîte) + indicateur de complétion
- Vue collection (grille/liste) + valeur totale agrégée
- Cote de marché par montre, mise à jour périodique
### P1 — Fast follow
- Graphique d'évolution de la cote (par montre + sur la collection globale)
- Alertes de variation significative de cote (+/- X % sur un modèle)
- Export de la fiche collection (assurance, revente)
- Wishlist v1 "light" : recherche/ajout manuel dans la base de modèles (pas de reconnaissance photo à ce stade)
### P2 — Plus tard
- Wishlist avec capture photo (scanner une montre vue en boutique/magazine)
- Onglet communautaire
## Points d'attention techniques (non résolus, à creuser avec Claude Code)
 
- **Base de modèles / banque de photos** : nécessaire pour la reconnaissance IA du flow principal. Cette même base peut alimenter la recherche de la wishlist (pas besoin de reconnaissance photo pour la wishlist en P1). Le vrai défi — reconnaître *n'importe quelle* montre même hors base — est repoussé en P2, une fois la base enrichie organiquement par les scans utilisateurs.
- **Source de la cote de marché** : à valider (fiabilité + légalité — scraping vs API officielle). Pistes : Chrono24, WatchCharts, eBay sold listings.
- **Monétisation** : ~~piste freemium à garder en tête~~ → **implémentée le 2026-07-04**, voir section Monétisation ci-dessous.

## Monétisation — modèle retenu (implémenté 2026-07-04)

**⚠️ Second pivot (2026-07-05, pendant la mise en prod ASC) : le rapport d'expert IA est SUPPRIMÉ** (inutile et coûteux — décision Tom). Retiré du code (API : lib/expert-report.ts, endpoints /watches/:id/expert-report, tables expert_reports/report_purchases droppées par la migration 0010 ; mobile : expert-report-card, use-expert-report, purchaseReportCredit), du paywall, des CGUV et de la fiche App Store. Aucun consommable `watchy_expert_report` dans ASC ni RevenueCat. Les paragraphes ci-dessous antérieurs au 2026-07-05 le mentionnent encore à titre historique.

**Freemium 2 paliers + packs consommables (1.2 du 2026-07-12).** Gratuit : **5 emplacements EN TOUT (collection + wishlist confondues)**, 5 reconnaissances photo/mois, cote rafraîchie tous les 30 j. Premium (4,99 €/mois · 39,99 €/an) : emplacements et scans illimités + cote hebdo + tableau de bord patrimonial + **alertes de cote push (±5 %)** + **coffre-fort papiers & factures** (bucket privé `watch-documents`, URLs signées, 10 docs/montre). **Packs consommables (1.2, sans abonnement)** : `watchy_scans_5` (5 scans, 1,99 € — crédités après le mensuel gratuit, ledger `scan_credits`) et `watchy_slots_3` (+3 emplacements permanents, 2,99 € — `entitlements.extra_slots`, survivent à l'expiration d'un abo) ; webhook RC idempotent via `consumable_purchases.rc_event_id`, refunds gérés (`CANCELLATION` → delta négatif). Liens affiliés et pub écartés (décision Tom : pas assez subtils). Détails et étapes manuelles : RELEASE-1.2.0.md. **Supprimés au pivot** (recherche web = poste de coût dominant, et pipeline photo jamais fonctionnel) : alertes de prix wishlist (l'infra push reste dormante pour la V2) et recherche automatique de photos de modèles. La wishlist prend à la place une **photo uploadée facultative** (identification vision via POST /recognition — quota scans partagé, zéro recherche web) qui devient le visuel de l'item ; la **reco photo détecte aussi le surnom de collectionneurs** (Batman, Pepsi…, jamais inventé) et l'apprend au catalogue (création organique + backfill des modèles matchés sans surnom).

**Gouvernance des coûts IA (mise à jour 2026-07-05 — chiffres MESURÉS).** Chaque appel IA logge son coût réel (`lib/ai-usage.ts`, lignes `[cost]` dans les logs Railway) — plus jamais de facture découverte après coup. Optimisations décisives : **prompt caching top-level sur les boucles pause_turn** (les continuations et itérations internes de recherche relisent le contexte à 0,1× au lieu de plein tarif — c'était LA fuite : une cote coûtait 1,50-2,50 $), continuations plafonnées à 2, cote sans thinking, max_tokens resserrés. **Coût mesuré : 0,09 $/cote** (Sonnet, 3 recherches max — vs ~2 $ avant, ÷20). Répartition : cote = Sonnet 4.6 ; enrichissement photo+surnom = Sonnet 4.6 (Haiku testé : ne trouve rien ; 2 recherches max, une seule fois par modèle via `enriched_at`) ; reco photo & rapport d'expert = Opus 4.8 (reco sous quota free, rapport premium et caché, 3 recherches max). Fraîcheur monétisée : 7 j premium / 30 j free. Économie unitaire : un premium actif (10 montres, consultations régulières) ≈ 1-2 $/mois de cotes — marge saine sur 4,99 €. ⚠️ Piège modèle : `web_search_20260209` exige le programmatic tool calling, non supporté par Haiku (400) — `allowed_callers: ['direct']` ou changer de modèle. **Action Tom : poser une limite de dépense mensuelle dans console.anthropic.com (Settings → Limits).** Grandfathering doux : l'existant au-delà de la limite n'est jamais supprimé, seul l'ajout est bloqué. Roadmap premium (non vendue sur le paywall tant que non livrée) : carnet d'entretien, partage de collection (le coffre-fort documents est livré en 1.2 et désormais vendu sur le paywall).

**Wishlist (refondue au pivot du 2026-07-05).** Table `wishlist_items` liée à `watch_models` (la saisie libre crée le modèle — croissance organique) + `photo_url` facultative uploadée par l'utilisateur : le mobile passe par POST /recognition (Opus vision, quota scans partagé) puis attache la photo à l'item ; visuel affiché = photo de l'item, sinon photo du modèle, sinon cadran. Le doublon répond 409 AVANT le quota (re-ajouter ne consomme pas d'emplacement). Plus d'alertes de prix ni d'enrichissement photo IA (supprimés — coût). **L'infra push a été réactivée le 2026-07-10 pour les campagnes manuelles uniquement** (voir § Back office) : opt-in à l'onboarding + profil, aucun envoi automatique dans le code. `pnpm catalog:nicknames` pose sans IA les surnoms des références iconiques ; la reco photo les détecte désormais elle-même (champ `nickname` du schéma de sortie, jamais inventé). Le nickname irrigue : recherche catalogue (« betman » trouve la Batman), recherche de cote, rapport d'expert, affichage mobile.

**Architecture.** Table `entitlements` (absence de ligne = free) mise à jour par le webhook RevenueCat (`POST /webhooks/revenuecat`, secret `REVENUECAT_WEBHOOK_SECRET`) ; quotas contrôlés serveur (`QUOTA_EXCEEDED`, `SCAN_QUOTA_EXCEEDED`, `PREMIUM_REQUIRED`) ; `GET /me` expose plan + compteurs ; `GET /portfolio` agrège la valeur/plus-value ; rapport d'expert généré en tâche de fond et caché dans `expert_reports`. Mobile : `lib/purchases.ts` isole `react-native-purchases` (stub en Expo Go ou sans clé — alerte « gratuit pendant la bêta ») ; paywall partagé onboarding + modal `/paywall`. Smoke test : `npx tsx --env-file=.env scripts/premium-test.mts` (API lancée).

**RevenueCat branché en Test Store (2026-07-04)** : clé `test_…` dans `apps/mobile/.env` (`EXPO_PUBLIC_REVENUECAT_IOS_KEY`) — les achats se **simulent sans App Store Connect ni compte Apple payant**. Tester dès maintenant : `npx expo run:ios` (dev build simulateur — le module natif n'existe pas dans Expo Go, qui reste en stub) → paywall avec prix réels du Test Store → achat simulé → listener SDK rafraîchit l'UI. ⚠️ L'entitlement **serveur** ne bascule que via le webhook : en local, tunnel `ngrok http 3000` + URL `https://<tunnel>/webhooks/revenuecat` + header `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>` (valeur dans apps/api/.env) dans le dashboard RC. Dashboard à vérifier : entitlement **`premium`** rattaché aux 2 produits, offering par défaut avec packages de type Monthly/Annual (le code tolère aussi les identifiants `monthly`/`yearly`). Le Customer Center (gestion d'abonnement in-app) s'ouvre depuis le profil pour les membres premium.

**Checklist d'activation réelle (quand le compte Apple Developer sera ouvert)** :
1. App Store Connect : créer l'app (bundle id `com.watchy-app.watchy`) + un groupe d'abonnement avec `watchy_premium_monthly` (4,99 €) et `watchy_premium_annual` (39,99 €, essai gratuit 7 j).
2. RevenueCat : projet + app iOS, entitlement `premium` rattaché aux 2 produits, offering par défaut (packages monthly/annual).
3. Clé API iOS RevenueCat → `EXPO_PUBLIC_REVENUECAT_IOS_KEY` dans `apps/mobile/.env`.
4. Webhook RevenueCat → URL publique de l'API `/webhooks/revenuecat`, header `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>` (valeur dans `apps/api/.env`).
5. Dev build (`expo run:ios`) + sandbox tester App Store Connect pour valider l'achat de bout en bout (le stub s'efface dès que la clé est présente et le module natif disponible).
6. **Légal** : CGUV + politique de confidentialité rédigées et intégrées in-app (`src/constants/legal.ts`, écrans `/legal/terms` et `/legal/privacy`, liées depuis paywall/onboarding/profil). Avant soumission : compléter les champs [À COMPLÉTER] (raison sociale, adresse, médiateur consommation), faire relire par un juriste, et héberger les deux textes sur une URL publique (App Store Connect exige une URL de politique de confidentialité, et le paywall doit pointer des liens web).

## Soumission App Store — checklist (audit du 2026-07-04)

Côté code, tout est prêt : suppression de compte in-app (DELETE /me + profil), paywall conforme 3.1.2, Sign in with Apple, app.json complet (buildNumber, supportsTablet:false, ITSAppUsesNonExemptEncryption:false), eas.json, rate limiting (/auth/guest 5/h/IP, global 300/min), Dockerfile prod, CORS restreint. Restent les actions à faire dans l'ordre :

1. **Compte Apple Developer** (99 €/an) — bloque tout le reste.
2. ~~Déploiement de l'API~~ ✅ **Fait (2026-07-04)** : `https://api.watchy-app.com` (Railway, projet `prolific-smile`, service **API** — attention, c'est CE service qui porte le domaine et les variables, pas `@watchy/api`). DATABASE_URL = Session pooler Supabase (l'hôte direct est IPv6-only, injoignable depuis Railway). Vérifié par `apps/api/scripts/prod-smoke.mts` (5 checks). eas.json pointe dessus. **Restent** : rotation des secrets (recommandée), supprimer les services Railway en doublon (`@watchy/api`, `@watchy/mobile` — facturés pour rien), et configurer l'URL du webhook RevenueCat : `https://api.watchy-app.com/webhooks/revenuecat` + header `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>`.
3. **SMTP custom Supabase** (Resend/Postmark…) — le SMTP intégré est limité à ~3 e-mails/h, intenable pour les confirmations d'inscription.
4. **Légal** : compléter les [À COMPLÉTER] (raison sociale, adresse, médiateur consommation — adhésion requise), relecture juriste, héberger CGUV + politique de confidentialité sur URL publique.
5. **EAS** : `eas init` (projectId), `eas build --profile production` — le projectId activera aussi les push réels.
6. **IAP + RevenueCat** : checklist § Monétisation (produits ASC, entitlement premium, clés, webhook).
7. **Fiche App Store Connect** : description, screenshots (6.9" et 6.5"), catégorie (Utilitaires ou Style de vie), age rating, questionnaire App Privacy (collecte : email, photos, données d'achat — liées à l'identité, pas de tracking tiers → pas d'ATT), URL politique de confidentialité.
8. **Tests sur iPhone réel** (jamais faits) : Apple/Google sign-in, parcours complet, achat sandbox sur dev build, push réels.
9. **TestFlight** (beta externe = mini-review) puis soumission.

## Fiche App Store (prête à coller dans App Store Connect)

- **Nom** : Watchy — Collection de montres
- **Sous-titre** (≤30 car.) : `Votre collection, sa cote`
- **Catégorie** : Style de vie (secondaire : Utilitaires) · **Age rating** : 4+
- **Mots-clés** (≤100 car.) : `montre,collection,cote,rolex,omega,seiko,estimation,valeur,horlogerie,submariner,gmt,luxe`
- **Texte promotionnel** : `Photographiez votre montre : l'IA l'identifie et suit sa cote. Votre collection, estimée et organisée.`
- **Description** :

> Watchy est le carnet de collection des passionnés de montres.
>
> PHOTOGRAPHIEZ, C'EST IDENTIFIÉ — Prenez votre montre en photo : l'intelligence artificielle reconnaît la marque, le modèle et la référence, jusqu'aux variantes que seuls les collectionneurs distinguent (Batman, Hulk, Pepsi…).
>
> SUIVEZ LA COTE — Chaque montre de votre collection est estimée à partir des données publiques du marché de l'occasion, avec l'historique d'évolution et la valeur « full set ».
>
> CONSTITUEZ VOTRE WISHLIST — Suivez les modèles que vous convoitez et leur cote.
>
> AVEC WATCHY PREMIUM — Collection illimitée, reconnaissances photo illimitées, tableau de bord patrimonial (valeur totale et plus-value) et cote actualisée chaque semaine. Essai gratuit de 7 jours, puis 4,99 €/mois ou 39,99 €/an.
>
> Les estimations sont fournies à titre indicatif et ne constituent ni expertise ni conseil en investissement. Conditions : https://api.watchy-app.com/legal/terms

- **URL politique de confidentialité** : `https://api.watchy-app.com/legal/privacy` ✅ en ligne
- **URL d'assistance** : `https://api.watchy-app.com/legal/mentions` (contact e-mail dedans) — un vrai site pourra remplacer plus tard
- **App Privacy (questionnaire)** : collecte **E-mail** (fonctionnement du compte, lié à l'identité), **Photos** (contenu utilisateur, lié à l'identité), **Achats** (historique d'abonnement, lié à l'identité), **Identifiants** (user ID, lié à l'identité). Pas d'utilisation pour tracking → **pas d'ATT**. Données utilisées par des prestataires (Supabase UE, Anthropic, RevenueCat, Apple).
- **Notes pour la review** : compte de démo à fournir (créer un compte e-mail dédié avec 2-3 montres seedées) + rappeler que le mode invité permet de tester sans compte.
- **Screenshots** (6.9" obligatoire) : 1. collection avec dashboard premium · 2. reconnaissance caméra · 3. fiche montre avec cote · 4. wishlist · 5. paywall. À capturer via `xcrun simctl io booted screenshot` sur iPhone 16 Pro (18.3).

## Back office (livré 2026-07-05)

`https://api.watchy-app.com/admin` (puis api.watchy-app.com/admin quand le certificat sera émis) — jeton `ADMIN_TOKEN` (apps/api/.env + Railway), cookie 30 j. Pages : **Vue d'ensemble** (inscrits, +24 h/+7 j, actifs 7 j, courbe 30 j), **Acquisition** (réponses à « Comment nous avez-vous connu ? » posée à l'onboarding — table acquisition_sources), **Revenus** (premium actifs, taux de conversion, MRR/ARR estimés via entitlements.product_id, ventes de rapports), **Coûts & ROI** (table ai_usage alimentée par chaque appel IA avec le user déclencheur ; coût/jour/7 j/30 j, coût moyen par utilisateur, top 10 des appels chers, marge estimée, alerte si > COST_ALERT_DAILY_USD, défaut 5 $), **Utilisateurs** (50 derniers, plan/source/montres/coût IA, e-mails masqués). **Profil déclaratif facultatif (2026-07-05)** : table `profiles` (tranche d'âge, ville/pays, connaissance horlogère — minimisation RGPD volontaire : jamais de date de naissance ni d'adresse complète), GET/PATCH /me/profile, collecté à l'onboarding (écran source 2 étapes, passable) et éditable depuis Profil → « Mes informations » ; répartitions expertise/âge dans /admin/acquisition ; politique de confidentialité à jour. **Équipe & premium promo (2026-07-05)** : page /admin/team (jeton maître uniquement) — jetons d'équipe individuels hachés sha256 en DB, révocables, accès lecture aux dashboards seulement ; page Utilisateurs : boutons « ⭐ Premium » (entitlement source=promo, sans paiement ni expiration — pour les testeurs) / « Retirer », réservés au jeton maître. Smoke test : scripts/admin-test.mts. Hors scope V1 : saisie des dépenses marketing (CAC), alerting e-mail, export CSV. **Notifications push (2026-07-10, amendé 1.2)** : page /admin/push (jeton maître uniquement) — envoi **manuel** de campagnes/annonces (titre + message), segments Tous / Premium / Free / Test par e-mail, compteurs d'appareils, historique en table `push_campaigns`, purge automatique des jetons expirés (tickets Expo `DeviceNotRegistered`). **Seule exception automatique (1.2) : les alertes de cote premium** (`lib/price-alerts.ts`) — greffées sur les refreshs de cote déjà déclenchés (zéro IA, zéro cron), seuil ±5 %, anti-doublon 7 j par modèle/variante (table `price_alerts`), opt-out via `notification_prefs` (toggle profil), textes FR/EN selon `push_tokens.locale`. Côté mobile (build 7) : primer d'onboarding passable + ligne Notifications dans le profil, ré-enregistrement silencieux du jeton au démarrage.

## Communauté (V2 — hors V1 beta, teaser « Bientôt » en place)

**Modèle acté (2026-07-04).** Profil **public ou privé au choix de l'utilisateur** (défaut : privé ; pseudo/avatar, vitrine de collection si public). **Les membres Premium créent des communautés, les free les rejoignent** (levier premium). Chaque communauté a un titre et fonctionne comme un thread Reddit (posts, commentaires, votes) : achat/revente, discussion par marque… **entièrement à la main des utilisateurs — Watchy ne crée ni n'anime aucune communauté**.

Schéma cible indicatif : `profiles` (pseudo, avatar, is_public), `communities` (titre, description, créateur), `community_members`, `posts`, `comments`, `votes`.

**Prérequis à construire AVANT le lancement (non négociables) :**
- Apple / UGC : modération, signalement de contenu, blocage d'utilisateurs, règles visibles — exigés par l'App Review pour tout contenu généré par les utilisateurs.
- CGUV : clauses UGC (responsabilité des contenus, procédure de retrait LCEN, règles de communauté). Pour l'achat/vente entre membres : Watchy = hébergeur, jamais intermédiaire de paiement — à cadrer explicitement.
- RGPD : passage en profil public = choix explicite et réversible.

**V1 beta** : icône header → écran teaser + bouton « Me prévenir » (table `feature_interest`) — le comptage (`select feature, count(*) from feature_interest group by 1`) mesure la demande avant d'investir.

## Design system — direction visuelle
 
Direction validée : sobriété façon Apple, avec un effet "liquid glass" (panneaux en verre dépoli superposés, profondeur, transparence). Palette et typographie pensées autour du monde horloger plutôt que des couleurs arbitraires.
 
### Couleurs
 
| Nom | Hex | Usage |
|---|---|---|
| Onyx | `#0A0A0C` | Fond principal, sombre |
| Pearl | `#F2F1ED` | Texte principal, surfaces claires |
| Steel | `#B8BEC6` | Texte secondaire, bordures de verre |
| Gold | `#C8A464` | Accent premium (complétion de fiche, badges) |
| Sapphire | `#5B8DBE` | Accent interactif (liens, actions) |
| Sage | `#7FA888` | Tendance positive (discret) |
| Crimson | `#B5564A` | Tendance négative (discret, pas alarmiste) |
 
### Typographie
 
- **Manrope** (500/600) — titres et chiffres clés (valeur de collection, prix). Les chiffres ont le même statut visuel qu'un gros numéro de cadran.
- **Inter** (400/500) — texte courant, labels.
- **IBM Plex Mono** — données chiffrées techniques (référence de modèle, montants), pour un rendu "chronographe".
### Layout & élément signature
 
- Cartes en verre dépoli (`backdrop-filter: blur`, bordure fine semi-transparente, léger reflet en haut de carte) superposées sur fond sombre, avec halos de couleur très diffus (or / saphir) pour la profondeur.
- **Élément signature : jauge circulaire façon sous-cadran de chronographe.** Utilisée à deux endroits avec la même charte visuelle :
  - % de complétion d'une fiche montre
  - tendance de cote (évolution de valeur)
  
  Le but : qu'une fiche "à compléter" et une fiche "qui prend de la valeur" se reconnaissent visuellement au même endroit de l'écran, avec le même type de jauge.
### Notes de mise en œuvre
 
- Effet de verre à utiliser avec retenue : c'est l'identité de l'app, pas un effet à appliquer partout sans discernement.
- Densité d'information faible par défaut (l'app doit rester lisible pour l'utilisateur grand public, pas seulement pour le collectionneur qui veut du détail).