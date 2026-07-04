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

**Freemium 2 paliers.** Gratuit : 5 montres max, 5 reconnaissances photo/mois (protège les coûts d'API IA), cote incluse (rafraîchie **tous les 30 j**), **wishlist illimitée**. Premium (4,99 €/mois · 39,99 €/an) : montres et scans illimités + **cote rafraîchie chaque semaine** + **tableau de bord patrimonial** (valeur totale, plus-value vs prix d'achat) + **rapport d'expert IA** par montre (histoire, authenticité, facteurs de cote, entretien) + **alertes de prix wishlist** (push quand la cote passe sous le prix cible).

**Gouvernance des coûts IA (2026-07-04).** Recherche web = 0,01 $/recherche + résultats facturés en tokens d'entrée. Répartition des modèles : cote = **Sonnet 4.6** (3/15 $ par MTok, 4 recherches max), enrichissement photo+surnom = **Haiku 4.5** (1/5 $, 2 recherches max, une fois par modèle grâce au cache `enriched_at`), reconnaissance photo & rapport d'expert = Opus 4.8 (5/25 $ — la reco est sous quota free, le rapport est premium et caché). Fraîcheur de cote monétisée : `STALE_DAYS_PREMIUM=7` / `STALE_DAYS_FREE=30` dans `lib/entitlements.ts`, appliquée par `routes/market-prices.ts` selon le plan du demandeur ; le job d'alertes garde la fenêtre premium et son plafond de 5 recherches/passage. Grandfathering doux : l'existant au-delà de la limite n'est jamais supprimé, seul l'ajout est bloqué. Roadmap premium (non vendue sur le paywall tant que non livrée) : carnet d'entretien, coffre-fort documents, partage de collection.

**Wishlist & alertes (implémenté 2026-07-04).** Table `wishlist_items` liée à `watch_models` (la saisie libre crée le modèle — croissance organique). Alertes : `push_tokens` (POST /me/push-token, no-op en Expo Go — dev build requis pour les push réels), job `pnpm alerts:check [--dry-run]` + passage automatique toutes les 6 h dans l'API ; anti-spam par `notifiedAt` vs `fetchedAt` de la cote. **Enrichissement automatique des modèles** (`lib/model-photo.ts`, un seul appel Claude Sonnet + web_search par modèle) : photo produit (téléchargée avec UA navigateur + Referer, magic bytes validés, ré-hébergée dans le bucket Supabase → `watch_models.photoUrl`) **et surnom de collectionneurs** (`nickname` : « Batman », « Hulk »… — jamais inventé). **Cache négatif** : `enriched_at` posé même en échec, pas de nouvelle tentative avant 30 j — aucune recherche « énergivore en tokens » rejouée. Déclenché à l'ajout wishlist, à l'enrichissement catalogue par la reco, et par `pnpm catalog:enrich --limit N [--all]` ; `pnpm catalog:nicknames` pose sans IA les surnoms des références iconiques. Le nickname irrigue : la recherche catalogue (ilike + trigram, « betman » trouve la Batman), la recherche de cote et le rapport d'expert (référence précisée), et l'affichage mobile (suggestions, wishlist, sheet de reco). Piège : les CDN du luxe (rolex.com…) et chrono24 bloquent le téléchargement direct — le prompt privilégie Wikimedia/presse horlogère/watchbase.

**Architecture.** Table `entitlements` (absence de ligne = free) mise à jour par le webhook RevenueCat (`POST /webhooks/revenuecat`, secret `REVENUECAT_WEBHOOK_SECRET`) ; quotas contrôlés serveur (`QUOTA_EXCEEDED`, `SCAN_QUOTA_EXCEEDED`, `PREMIUM_REQUIRED`) ; `GET /me` expose plan + compteurs ; `GET /portfolio` agrège la valeur/plus-value ; rapport d'expert généré en tâche de fond et caché dans `expert_reports`. Mobile : `lib/purchases.ts` isole `react-native-purchases` (stub en Expo Go ou sans clé — alerte « gratuit pendant la bêta ») ; paywall partagé onboarding + modal `/paywall`. Smoke test : `npx tsx --env-file=.env scripts/premium-test.mts` (API lancée).

**RevenueCat branché en Test Store (2026-07-04)** : clé `test_…` dans `apps/mobile/.env` (`EXPO_PUBLIC_REVENUECAT_IOS_KEY`) — les achats se **simulent sans App Store Connect ni compte Apple payant**. Tester dès maintenant : `npx expo run:ios` (dev build simulateur — le module natif n'existe pas dans Expo Go, qui reste en stub) → paywall avec prix réels du Test Store → achat simulé → listener SDK rafraîchit l'UI. ⚠️ L'entitlement **serveur** ne bascule que via le webhook : en local, tunnel `ngrok http 3000` + URL `https://<tunnel>/webhooks/revenuecat` + header `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>` (valeur dans apps/api/.env) dans le dashboard RC. Dashboard à vérifier : entitlement **`premium`** rattaché aux 2 produits, offering par défaut avec packages de type Monthly/Annual (le code tolère aussi les identifiants `monthly`/`yearly`). Le Customer Center (gestion d'abonnement in-app) s'ouvre depuis le profil pour les membres premium.

**Checklist d'activation réelle (quand le compte Apple Developer sera ouvert)** :
1. App Store Connect : créer l'app (bundle id `com.tomdebout.watchy`) + un groupe d'abonnement avec `watchy_premium_monthly` (4,99 €) et `watchy_premium_annual` (39,99 €, essai gratuit 7 j).
2. RevenueCat : projet + app iOS, entitlement `premium` rattaché aux 2 produits, offering par défaut (packages monthly/annual).
3. Clé API iOS RevenueCat → `EXPO_PUBLIC_REVENUECAT_IOS_KEY` dans `apps/mobile/.env`.
4. Webhook RevenueCat → URL publique de l'API `/webhooks/revenuecat`, header `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>` (valeur dans `apps/api/.env`).
5. Dev build (`expo run:ios`) + sandbox tester App Store Connect pour valider l'achat de bout en bout (le stub s'efface dès que la clé est présente et le module natif disponible).
6. **Légal** : CGUV + politique de confidentialité rédigées et intégrées in-app (`src/constants/legal.ts`, écrans `/legal/terms` et `/legal/privacy`, liées depuis paywall/onboarding/profil). Avant soumission : compléter les champs [À COMPLÉTER] (raison sociale, adresse, médiateur consommation), faire relire par un juriste, et héberger les deux textes sur une URL publique (App Store Connect exige une URL de politique de confidentialité, et le paywall doit pointer des liens web).

## Soumission App Store — checklist (audit du 2026-07-04)

Côté code, tout est prêt : suppression de compte in-app (DELETE /me + profil), paywall conforme 3.1.2, Sign in with Apple, app.json complet (buildNumber, supportsTablet:false, ITSAppUsesNonExemptEncryption:false), eas.json, rate limiting (/auth/guest 5/h/IP, global 300/min), Dockerfile prod, CORS restreint. Restent les actions à faire dans l'ordre :

1. **Compte Apple Developer** (99 €/an) — bloque tout le reste.
2. **Rotation des secrets** (mot de passe DB, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, REVENUECAT_WEBHOOK_SECRET) puis **déploiement de l'API** (Fly.io/Railway/Render, image Docker prête) avec secrets en variables d'env du provider. Renseigner l'URL prod dans `eas.json` (placeholders `REMPLACER-PAR-URL-API-PROD`).
3. **SMTP custom Supabase** (Resend/Postmark…) — le SMTP intégré est limité à ~3 e-mails/h, intenable pour les confirmations d'inscription.
4. **Légal** : compléter les [À COMPLÉTER] (raison sociale, adresse, médiateur consommation — adhésion requise), relecture juriste, héberger CGUV + politique de confidentialité sur URL publique.
5. **EAS** : `eas init` (projectId), `eas build --profile production` — le projectId activera aussi les push réels.
6. **IAP + RevenueCat** : checklist § Monétisation (produits ASC, entitlement premium, clés, webhook).
7. **Fiche App Store Connect** : description, screenshots (6.9" et 6.5"), catégorie (Utilitaires ou Style de vie), age rating, questionnaire App Privacy (collecte : email, photos, données d'achat — liées à l'identité, pas de tracking tiers → pas d'ATT), URL politique de confidentialité.
8. **Tests sur iPhone réel** (jamais faits) : Apple/Google sign-in, parcours complet, achat sandbox sur dev build, push réels.
9. **TestFlight** (beta externe = mini-review) puis soumission.

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