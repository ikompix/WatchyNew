# Handoff : Watchy — écrans clés P0 (MVP)

## Overview
Watchy est une app mobile (iOS/Android) de suivi de collection de montres. Ce bundle documente les **4 moments clés du MVP (P0)** :
1. **Capture + reconnaissance IA** (3 états : analyse en cours, montre reconnue, montre non reconnue → fallback recherche manuelle)
2. **Fiche montre** avec champs optionnels progressifs + indicateur de complétion
3. **Vue collection** (portefeuille) + valeur totale agrégée
4. **Détail de cote de marché** + évolution dans le temps

Plus un **onboarding complet de première ouverture (6 écrans)** conforme aux exigences de la revue App Store (voir section dédiée).

Principe produit central : la saisie détaillée est **optionnelle et progressive**, jamais bloquante à l'ajout. Densité d'information faible par défaut (l'app doit rester lisible pour le grand public, pas seulement le collectionneur).

## About the Design Files
Les fichiers de ce bundle sont des **références de design réalisées en HTML** — des maquettes montrant l'apparence et le comportement voulus, **pas du code de production à copier tel quel**. La tâche est de **recréer ces écrans dans l'environnement cible** (React Native, Expo, SwiftUI + Jetpack Compose, Flutter…) avec ses patterns et librairies établis. Si aucun environnement n'existe encore, choisir le framework le plus adapté à une app mobile cross-platform (recommandation : **React Native / Expo**) et y implémenter les designs.

Le fichier `Watchy Screens.dc.html` contient **deux directions visuelles** explorées + un tour de typographies. **La direction retenue est la direction claire (`1b`) avec la typo `Space Grotesk` (tour `2a`).** La direction sombre (`1a`) est conservée à titre de référence uniquement — ne pas l'implémenter sauf demande contraire.

## Fidelity
**Haute-fidélité (hifi).** Couleurs, typographie, espacements et hiérarchie sont définitifs. Recréer l'UI au pixel près avec les composants natifs de la codebase. Les seuls placeholders sont les **visuels de montres** : ils sont représentés par un « cadran abstrait » (cercle métallique + aiguilles) en attendant les vraies photos produit / la banque d'images.

---

## Direction visuelle retenue (1b + Space Grotesk)

Sobriété façon Apple avec un effet **liquid glass** (panneaux en verre dépoli superposés, profondeur, transparence). **À utiliser avec retenue** : c'est l'identité de l'app, pas un effet à mettre partout. Concrètement, le verre n'est utilisé que pour : cartes de contenu surélevées, feuille de résultat de reconnaissance, barre/bouton d'action, mini-cartes.

### Palette
| Rôle | Valeur |
|---|---|
| Fond écran (dégradé) | `#eef1f5` → `#e4e9f0` (linéaire 178°) |
| Fond « chambre » (capture) | `#e9edf2` → `#d3d9e1` (radial) |
| Texte primaire | `#1b2531` |
| Texte secondaire | `rgba(27,37,49,.55)` |
| Texte tertiaire / placeholder | `rgba(27,37,49,.40)` |
| Accent (bleu acier) | `#5b7fa6` — variante foncée `#4a6f97`, bouton dégradé `#6b8fb6`→`#4a6f97` |
| Positif (plus-value) | `#2e7a4f` |
| Négatif (moins-value) | `#b0692e` |
| Cadran montre (placeholder) | radial `#fbfcfd`→`#c4ccd6`, bordure `rgba(120,140,165,.4)` |

### Matériau verre (« liquid glass », variante claire)
```
background: rgba(255,255,255,.62);
backdrop-filter: blur(24px) saturate(1.6);   /* + préfixe -webkit- */
border: 1px solid rgba(255,255,255,.8);
box-shadow: inset 0 1px 0 rgba(255,255,255,.95), 0 16px 34px rgba(40,55,80,.12);
```
Sous chaque zone de verre, il y a un « glow » : un cercle flouté de l'accent (`filter: blur(46px)`, `rgba(91,127,166,.2–.28)`) placé derrière, pour que le `backdrop-filter` capte de la couleur et donne la profondeur. En natif, reproduire via un blur view (iOS `UIBlurEffect`/SwiftUI `.ultraThinMaterial`, RN `expo-blur` / `@react-native-community/blur`) posé au-dessus d'un halo coloré flou.

### Typographie — **Space Grotesk**
Toute l'UI est en **Space Grotesk** (Google Fonts). Les **références produit** (ex. `RÉF. RH-3126`) restent en **monospace** (`ui-monospace, Menlo, monospace`), en `#5b7fa6`, `letter-spacing: .03em`, uppercase. Les nombres monétaires utilisent `font-variant-numeric: tabular-nums`.

Échelle type (px / poids) :
| Usage | Taille | Poids | Notes |
|---|---|---|---|
| Grand titre écran (« Collection ») | 30 | 600 | letter-spacing −0.02em |
| Valeur totale / cote (hero) | 30–38 | 600 | tabular-nums, tracking serré |
| Titre de bloc / maison | 14–17 | 600 | |
| Nom de modèle / secondaire | 12–14 | 400–500 | couleur secondaire |
| Valeurs de ligne | 13 | 600 | tabular-nums |
| Delta % | 11 | 500 | vert/orange |
| Méta / label | 11–12 | 400–500 | couleur secondaire |
| Référence (mono) | 12 | — | ui-monospace |

### Autres tokens
- **Rayons** : cartes 18–26px · champs & mini-cartes 15px · pilules/badges 20px · bouton principal 16px · cadran 50%.
- **Bouton capture flottant (FAB)** : Ø 58px, dégradé accent, `box-shadow: 0 12px 26px rgba(74,111,151,.45)`, ancré bas-droite (`right:20px; bottom:26px`).
- **Barre d'état** simulée : heure à gauche, « 5G » + icône batterie à droite, texte `#1b2531`.
- **Dynamic island** : pilule noire 90×26, centrée, top 11px.
- **Frame** : écran 300×648 (ratio ~iPhone), rayon 38px ; à adapter au device réel.

---

## Screens / Views (direction 1b)

### 1. Capture — Analyse IA en cours
- **Purpose** : l'utilisateur cadre sa montre, l'IA analyse.
- **Layout** : viewfinder plein écran (fond clair « chambre »), cadran centré, **réticule** (4 coins arrondis, accent) + **ligne de scan** animée qui balaie verticalement (keyframe `scanY`, 2.6s, ease-in-out, aller-retour). En bas, carte verre : 3 points qui clignotent (`blink`, décalés 0/.2/.4s) + « Analyse en cours… » / sous-texte « Identification du boîtier & du cadran ».

### 2. Capture — Montre reconnue (confiance 96%)
- **Purpose** : présenter le résultat auto-rempli, confirmer l'ajout.
- **Layout** : cadran en haut, **feuille de résultat** en verre (rayon 26px) en bas :
  - Badge vert « Identifiée · confiance 96% » (fond `rgba(64,128,90,.14)`, texte `#2e7a4f`).
  - Maison (24px/700), modèle (15px/500), référence mono.
  - Séparateur, ligne « Cote de marché estimée » → « ≈ 14 200 € ».
  - **Bouton principal** pleine largeur (dégradé accent, blanc) « Ajouter à la collection ».
  - Lien secondaire centré « Ce n'est pas ça ? » (déclenche le fallback manuel).

### 3. Capture — Non reconnue (fallback recherche)
- **Purpose** : quand l'IA échoue, chercher/saisir manuellement dans la base de modèles.
- **Layout** : icône loupe dans une tuile accent, titre « Montre non reconnue », sous-texte. Champ de recherche (verre) « Marque, modèle ou référence… ». Label « Suggestions de la base ». **3 lignes de suggestion** (verre) : mini-cadran + maison (17px) + « modèle · réf » + chevron. Pied : lien « Saisir manuellement ».

### 4. Fiche montre (complétion 60%)
- **Purpose** : consulter/compléter la fiche à son rythme.
- **Layout** :
  - **Bandeau photo** pleine largeur (238px, fond radial clair) avec cadran hero centré ; « ‹ » retour à gauche, « Modifier » (accent) à droite.
  - Titre maison (23px/700) + « modèle · RÉF mono ».
  - **Barre de complétion linéaire** : label « Fiche complétée » + « 60% » (accent) au-dessus d'une barre 7px (piste `rgba(27,37,49,.09)`, remplissage dégradé accent à 60%).
  - **Liste de champs** (verre, lignes séparées) : `Date d'achat → Mars 2022`, `Prix d'achat → 12 800 €` (remplis) ; `Papiers → + Ajouter`, `Boîte d'origine → + Ajouter` (action accent, non bloquants).
  - Bandeau cote : « Cote actuelle » → « 14 200 € » + « +11% » (vert).

### 5. Collection — Portefeuille (écran d'accueil)
- **Purpose** : visualiser la collection et l'évolution de valeur.
- **Layout** :
  - Grand titre « Collection ».
  - **Carte valeur totale** (verre) : « Valeur totale · 6 montres », montant hero (30px/600, tabular-nums) « 82 050 € », delta « ▲ +4,0% » (vert), + **sparkline** de la collection (aire + trait accent).
  - Segmented text « Par valeur » (actif, souligné accent 2px) / « Récent ».
  - **Liste de montres** : chaque ligne = mini-cadran (44px) + maison/modèle + **mini-sparkline** (vert si hausse, orange si baisse) + valeur (droite, tabular-nums) + delta %.
  - **FAB capture** flottant bas-droite (voir tokens).
  - ⚠️ Cette direction n'a **pas** de barre d'onglets basse : navigation par grand titre + FAB.

### 6. Détail cote de marché
- **Purpose** : suivre la cote d'un modèle et sa plus-value.
- **Layout** : « ‹ » + maison/modèle. « Cote de marché · aujourd'hui », montant hero « 14 200 € » (38px/800→ici 600, tabular-nums) + « ▲ 11,2% » (vert), sous-texte « +1 400 € depuis l'achat · 12 mois ». **Graphique** aire+trait accent (~12 points, point final marqué). **Sélecteur de période** segmenté `1M / 6M / 1A(actif) / MAX`. Deux mini-cartes verre : « Prix d'achat → 12 800 € » et « Plus-value → +1 400 € » (vert).

---

---

## Onboarding — parcours de première ouverture (6 écrans)

Principe : **minimal, aucune friction, aucun compte forcé**. Le compte est proposé mais toujours contournable ; après la permission caméra, l'app enchaîne directement sur le flux capture → reconnaissance. Direction claire + Space Grotesk. Séquence :

1. **Accueil & compte** (fusionnés) — wordmark WATCHY + cadran hero + tagline « Votre collection, suivie et estimée. ». Boutons d'auth : **Continuer avec Apple** (noir, en premier), **Google**, **e-mail**, puis lien prominent **« Continuer sans compte »**. Note de bas : compte facultatif, création/export/suppression possibles dans les Réglages.
2. **Comment ça marche** — 3 points (Photographiez → L'IA identifie → Suivez la cote), bouton « Continuer ».
3. **Permission caméra (primer)** — écran d'explication *avant* le prompt système, puis représentation du dialogue iOS natif (« Watchy souhaite accéder à l'appareil photo »). Boutons « Activer l'appareil photo » / « Pas maintenant ».
4. **Notifications (primer)** — explication des alertes de cote (P1), exemple d'alerte, « Activer les notifications » / « Plus tard ». Opt-in.
5. **Confidentialité / ATT** — « Vos données vous appartiennent » (3 garanties), toggle *opt-in* « Aider à améliorer Watchy » (analyse anonyme, **off** par défaut), liens Politique de confidentialité + CGU, bouton « J'ai compris ».
6. **Premium (soft paywall, skippable)** — features premium, offres Annuel (39,99 €) / Mensuel (4,99 €), « Essai gratuit de 7 jours », « Restaurer les achats », « Peut-être plus tard », mention renouvellement auto + liens EULA/Confidentialité.

### Conformité App Store — ce qui est couvert (et où)
| Exigence Apple / cadre | Écran | Comment |
|---|---|---|
| **5.1.1(v)** — pas de compte obligatoire pour la valeur cœur | 01 | « Continuer sans compte » équivalent aux options d'auth |
| **5.1.1(v)** — suppression de compte in-app | 01 (note) + Réglages | Mention explicite ; à implémenter dans les Réglages |
| **4.8** — Sign in with Apple si login tiers proposé | 01 | Apple listé en premier, à côté de Google |
| **Permission priming** — expliquer avant le prompt | 03 (caméra), 04 (push) | Écran d'amorce avant le dialogue système natif |
| **NSCameraUsageDescription** | 03 | Chaîne d'usage claire (identification par photo) |
| **ATT / App Privacy** — tracking = opt-in explicite | 05 | Toggle off par défaut ; si tracking cross-app réel → déclencher le prompt ATT ici |
| **RGPD** — transparence + liens légaux | 05 | Garanties données + liens confidentialité/CGU |
| **3.1.2** — abonnements : prix, durée, renouvellement, restauration, EULA | 06 | Tous éléments présents ; paywall skippable |
| **2.3.1** — pas de sur-promesse | 02 | Description honnête du fonctionnement |

### Notes d'implémentation onboarding (important)
- **Boutons Apple / Google** : les visuels ici sont des **placeholders stylisés**. Utiliser les composants/SDK **officiels** (Sign in with Apple natif, Google Identity Services) — obligatoire pour la revue et les guidelines de marque.
- **Prompts système** (caméra, notifications, ATT) : **non stylables** — l'écran 03/04 est le *primer* qui précède le dialogue iOS. Ne pas tenter de reproduire le dialogue système en UI custom (l'aperçu ici n'est qu'illustratif).
- **Paywall** : brancher sur StoreKit 2 / RevenueCat ; « Restaurer les achats » obligatoire ; le tier gratuit doit rester pleinement utilisable (collection illimitée, cote, reconnaissance IA de base).
- **Ordre** : le compte en tête est un choix produit validé (fusion accueil+compte) ; il reste contournable, donc conforme. Si la revue objecte, basculer l'auth après le 1er ajout.

---

## Interactions & Behavior
- **Flow principal** : FAB/Capture → caméra (état 1) → succès (état 2) → « Ajouter » → Fiche (4) ; ou échec (état 3) → recherche/saisie → Fiche.
- **Reconnaissance** : afficher un score de confiance ; en dessous d'un seuil (à définir, ex. < ~70%), proposer directement le fallback (état 3) plutôt que l'auto-remplissage.
- **Complétion progressive** : « + Ajouter » ouvre la saisie du champ (date picker, montant, toggles Papiers/Boîte). Chaque champ rempli augmente le % de complétion. **Jamais bloquant** — on peut ajouter une montre avec zéro champ optionnel.
- **Cote** : mise à jour périodique (P0). Le graphe et les deltas se recalculent à la réception.
- **Animations** : ligne de scan (2.6s, ease-in-out, boucle) ; points d'analyse (blink, boucle, décalés) ; transitions de feuille (slide-up recommandé) ; press-states standards plateforme sur boutons/lignes.
- **États à prévoir** : chargement (analyse IA, fetch cote), succès, erreur/non-reconnu, **collection vide** (non maquetté — prévoir un empty state incitant à ajouter la 1re montre), hors-ligne (cote indisponible → afficher dernière valeur connue + horodatage).

## State Management
- `watches[]` : { id, maison, modèle, référence, dialColor(placeholder), photoUri, dateAchat?, prixAchat?, papiers:bool, boite:bool, completionPct(dérivé) }
- `coteByWatch[watchId]` : { valeurActuelle, série temporelle [{date, valeur}], deltaPct, plusValue(dérivée = valeurActuelle − prixAchat) }
- `collectionTotal` (dérivé = Σ valeurActuelle), `collectionDelta` (dérivé sur période)
- Flux capture : `captureState` ∈ { idle, analyzing, recognized(payload, confidence), notRecognized } ; requête recherche `query` + résultats base de modèles.
- Fetch : reconnaissance IA (photo → modèle), recherche base de modèles, cote de marché (source à valider : Chrono24 / WatchCharts / eBay sold — fiabilité + légalité à trancher).

## Design Tokens
Voir tableaux « Palette », « Typographie » et « Autres tokens » ci-dessus. Résumé accents : `#5b7fa6` / `#4a6f97` (bleu acier), `#2e7a4f` (positif), `#b0692e` (négatif), texte `#1b2531`. Rayons 15/18/20/26. Font : Space Grotesk (UI) + monospace (réf).

## Assets
- **Aucune image réelle** dans les maquettes. Les montres sont des **placeholders** (cadran abstrait CSS). À remplacer par : photos produit de la banque d'images / base de modèles, et photos utilisateur (capture).
- **Icônes** : dessinées en SVG inline (loupe, appareil photo, grille, courbe, chevrons). À remplacer par le set d'icônes de la codebase (SF Symbols / Material / lucide…).
- **Police** : Space Grotesk (Google Fonts) — l'embarquer dans l'app.

## Files
- `Watchy Screens.dc.html` — maquette hifi des 12 écrans (2 directions + tour typo). **Ouvrir dans un navigateur.** Implémenter uniquement la direction claire `1b` en Space Grotesk (= tour `2a` appliqué à `1b`). La direction sombre `1a` est une alternative de référence.
