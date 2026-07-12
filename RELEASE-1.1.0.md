# Release 1.1.0 — checklist et textes à coller

**Build 7** (1.1.0) soumis via EAS avec auto-submit TestFlight le 2026-07-10 —
il remplace le build 6 (il ajoute les notifications push opt-in + page BO).
Ce fichier regroupe tout ce qui se fait à la main dans les dashboards.

## 0. Test push de bout en bout — ✅ validé le 2026-07-10

Fait sur iPhone réel (build 7) : jeton enregistré, envoi BO segment Test,
receipt Expo `ok`, notification reçue. Au passage, l'ancienne Push Key APNs
héritée du prototype (`X5CQD45H6V`, invalide → `InvalidProviderToken`) a été
remplacée par `72YT24P752` via `eas credentials` — aucun rebuild nécessaire.

## 1. App Store Connect — version 1.1.0

1. Ma page d'app → « + » → nouvelle version **1.1.0**.
2. Sélectionner le **build 7** (attendre la fin du processing TestFlight).
3. Notes de version :
   - **FR** :
     > Watchy parle désormais anglais ! L'app s'adapte à la langue de votre appareil (français ou anglais), avec un sélecteur manuel dans le profil. Corrections et améliorations diverses, dont un correctif de l'ajout de montre.
   - **EN** (visible une fois la localisation anglaise ajoutée, cf. § 2) :
     > Watchy now speaks English! The app follows your device language (French or English), with a manual selector in your profile. Various fixes and improvements, including a fix for adding watches.
4. Submit for Review (compte démo review inchangé : `demo@watchy-app.com`).

## 2. App Store Connect — localisation anglaise (English U.S.)

Ma page d'app → dans le sélecteur de langue de la fiche, ajouter **English (U.S.)**, puis coller :

- **Nom** : `Watchy — Watch Collection`
- **Sous-titre** (≤30) : `Your watches, their value`
- **Mots-clés** (≤100) : `watch,collection,value,rolex,omega,seiko,appraisal,price,horology,submariner,gmt,luxury`
- **Texte promotionnel** :
  > Snap a photo of your watch: AI identifies it and tracks its market value. Your collection, organized and appraised.
- **Description** :
  > Watchy is the collection log for watch enthusiasts.
  >
  > SNAP IT, IT'S IDENTIFIED — Take a photo of your watch: artificial intelligence recognizes the brand, model and reference, down to the variants only collectors can tell apart (Batman, Hulk, Pepsi…).
  >
  > TRACK THE MARKET VALUE — Every watch in your collection is appraised from public pre-owned market data, with value history and "full set" pricing.
  >
  > BUILD YOUR WISHLIST — Follow the models you covet and their market value.
  >
  > WITH WATCHY PREMIUM — Unlimited collection, unlimited photo recognition, portfolio dashboard (total value and capital gains) and weekly value updates. 7-day free trial, then €4.99/month or €39.99/year.
  >
  > Estimates are provided for information purposes only and do not constitute an expert appraisal or investment advice. Terms: https://api.watchy-app.com/legal/terms
- **URL politique de confidentialité** : `https://api.watchy-app.com/legal/privacy?lang=en`
- **URL d'assistance** : `https://api.watchy-app.com/legal/mentions?lang=en`
- **Screenshots** : réutiliser les FR pour l'instant (optionnel plus tard : captures EN sur simulateur, app en anglais).
- **Abonnements** : dans le groupe d'abonnement, ajouter la localisation anglaise des noms/descriptions de `watchy_premium_monthly` et `watchy_premium_annual` (ex. « Watchy Premium — Monthly / Annual »).

## 3. Supabase (prod) — e-mails bilingues

Dashboard Supabase (projet prod `ahjbfjrauwarxlvzwcnq`) → **Authentication → Emails → Templates** :

- **Confirm signup** : sujet `Confirmez votre adresse · Confirm your email — Watchy`, corps = contenu de `supabase/templates/confirmation.html`.
- **Reset password** : sujet `Réinitialisez votre mot de passe · Reset your password — Watchy`, corps = contenu de `supabase/templates/recovery.html`.

(Les templates du repo font foi ; le config.toml ne s'applique qu'au local.)

## 4. Reste à faire (hors release, non bloquant)

- **Médiateur de la consommation** (adhésion obligatoire — CNPM, Medicys, CM2C…) + téléphone pro → à insérer dans `packages/types/src/legal/*.ts` quand obtenus.
- Rotation des secrets prod ; suppression des services Railway en doublon (`@watchy/api`, `@watchy/mobile`) ; limite de dépense mensuelle console.anthropic.com.
- Envisager d'exécuter `db:migrate` au démarrage du service Railway (l'oubli de la migration 0011 a cassé l'ajout de montre en prod du 06/07 au 10/07).
